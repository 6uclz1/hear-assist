"""Haas-ja-v1.0 の量子化 ONNX エンコーダを sherpa-onnx WASM で読める形に変換する。

- encoder.data（外部データ）を埋め込んで 1 ファイルにする。sherpa-onnx はモデルを
  メモリから読むため、ONNX Runtime が外部データのパスを解決できない。
- ConvInteger の int8 重みを uint8（+128、zero point 128）に置き換える。WASM 版の
  ONNX Runtime には int8 重みの ConvInteger 実装が無い。計算結果は変わらない。

使い方: uv run --no-project --with onnx --with numpy python scripts/haas/prepare_wasm_encoder.py IN OUT
"""

import sys

import numpy as np
import onnx
from onnx import numpy_helper


def main(src: str, dst: str) -> None:
    model = onnx.load(src, load_external_data=True)
    graph = model.graph
    initializers = {init.name: init for init in graph.initializer}
    unused_zero_points = set()
    converted = 0

    for node in graph.node:
        if node.op_type != "ConvInteger":
            continue
        weight_name = node.input[1]
        weight = numpy_helper.to_array(initializers[weight_name])
        if weight.dtype != np.int8:
            continue
        zero_point_name = node.input[3] if len(node.input) > 3 and node.input[3] else None
        zero_point = (
            numpy_helper.to_array(initializers[zero_point_name]).astype(np.int16)
            if zero_point_name
            else np.zeros((), np.int16)
        )
        initializers[weight_name].CopyFrom(
            numpy_helper.from_array((weight.astype(np.int16) + 128).astype(np.uint8), weight_name)
        )
        new_zero_point_name = f"{weight_name}_u8_zero_point"
        graph.initializer.append(
            numpy_helper.from_array((zero_point + 128).astype(np.uint8), new_zero_point_name)
        )
        while len(node.input) < 4:
            node.input.append("")
        if zero_point_name:
            unused_zero_points.add(zero_point_name)
        node.input[3] = new_zero_point_name
        converted += 1

    still_used = {name for node in graph.node for name in node.input}
    for init in list(graph.initializer):
        if init.name in unused_zero_points and init.name not in still_used:
            graph.initializer.remove(init)

    onnx.save_model(model, dst, save_as_external_data=False)
    print(f"converted {converted} ConvInteger nodes -> {dst}")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
