# 第三方组件与许可

本项目包含以下第三方组件。各组件的版权归其作者所有，使用时请遵守对应许可证。

## EBCTFCodeBox

- 上游：<https://github.com/Henglie/EBCTFCodeBox>
- 版本/提交：`v0.1.12`，`45f004c6cc7b0c344ba3acd335689be10dd60b02`
- 许可证：**Apache License 2.0**；完整文本见 [`renderer/ebctf/LICENSE`](renderer/ebctf/LICENSE)
- 使用方式：保留上游算法引擎（`src/core/`、`public/`、`addons/`、`bin/` 等），移除上游工具箱界面（`index.html`、`src/main.js`、`src/ui/`）；由主进程在 `127.0.0.1` 的随机端口提供 `engine.html`，本应用通过原生函数库界面调用，不再显示上游工具箱。
- 修改说明：未修改上游算法；应用的 `engine.html` 仅负责加载算法注册表并以 `postMessage` 暴露调用接口；上游 UI 文件已删除。
- 上游版权与第三方资源声明：见 `renderer/ebctf/` 中的 `LICENSE`、`README.md` 及其自带资源文件。

## jsQR

- 上游：<https://github.com/cozmo/jsQR>
- 许可证：MIT
- 使用方式：文件 [`renderer/vendor/jsqr.js`](renderer/vendor/jsqr.js)，用于离线二维码识别。

## Electron / Electron Builder

- Electron：MIT，<https://github.com/electron/electron>
- electron-builder：MIT，<https://github.com/electron-userland/electron-builder>
- 仅作为应用运行时和打包工具使用，未修改其源码。

## 说明

本项目的自有代码采用 MIT License（见 [`LICENSE`](LICENSE)）。第三方组件仍适用其各自许可证；如与 MIT 冲突，以第三方许可证为准。
