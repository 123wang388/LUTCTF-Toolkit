# 第三方组件与许可

本项目包含以下第三方组件。各组件的版权归其作者所有，使用时请遵守对应许可证。

## EBCTFCodeBox

- 上游：<https://github.com/Henglie/EBCTFCodeBox>
- 版本/提交：`v0.1.12`，`45f004c6cc7b0c344ba3acd335689be10dd60b02`
- 许可证：**Apache License 2.0**；完整文本见 [`renderer/ebctf/LICENSE`](renderer/ebctf/LICENSE)
- 使用方式：将上游静态站点文件原样放置于 `renderer/ebctf/`，由主进程在 `127.0.0.1` 的随机端口提供本地静态服务，并通过 iframe 嵌入「EBCTFCodeBox 完整密码学工具箱」页面。
- 修改说明：未修改上游算法或业务代码；仅在应用侧增加本地静态服务、iframe 容器和入口封装。若后续修改上游文件，应在此处补充说明。
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
