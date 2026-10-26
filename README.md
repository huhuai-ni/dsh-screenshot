# dsh-screenshot

DSH 插件：**全局快捷键截屏**。

## 功能

- 自定义全局快捷键（默认 `Ctrl+Alt+S`）
- 两种范围：整屏 / 当前窗口
- 截图存到自定义目录（默认 `图片/dsh-shot`）
- 设置页里有截图墙，能直接看最近的图
- 工具：`shot_capture` / `shot_latest` / `shot_list` / `shot_hotkey`

## 安装

```bash
dsh plugin --profile desktop add dsh-screenshot
```

设置 → 插件 → **截屏**，改快捷键、选范围、选目录，点「保存并注册」。

## 快捷键写法

- `Ctrl+Alt+S`
- `F9`
- `PrintScreen`
- `Ctrl+Shift+F12`

支持 `Ctrl` / `Alt` / `Shift` / `Win` 四个修饰键。

## 原理

- 后端在插件启动时拉起一个隐藏的 PowerShell 进程，用 Win32 `RegisterHotKey` 注册热键
- 热键触发 → 调 `scripts/capture.ps1` → `System.Drawing` 抓屏 → 存 PNG
- 设置页通过 `/api/shot/*` 改配置、立即截图、读图

快捷键只在 **DSH 运行期间**有效；DSH 关了热键就没了。

## 工具

| 工具 | 作用 |
|---|---|
| `shot_capture` | 立刻截图，返回路径 |
| `shot_latest` | 最近一张 |
| `shot_list` | 最近 N 张 |
| `shot_hotkey` | 查看/修改快捷键 |

## 限制

- Windows 专用（用了 Win32 + System.Drawing）
- 还没有区域截取（框选），路线图里
---

## 微信式区域截屏（0.2.0）

按热键后不再直接截全屏，而是：

1. **冻结屏幕**（当前画面定格）
2. 整屏变暗，鼠标变十字
3. **拖一个框**，框里保持原色，右下角显示尺寸
4. 松手 → 只保存框内区域
5. 中途 **Esc 取消**

范围选项：

| 值 | 行为 |
|---|---|
| `region`（默认） | 拖框选择 |
| `full` | 直接截整屏 |
| `window` | 截当前前台窗口 |

## 踩过的两个坑（给后来人）

1. **PowerShell 脚本第一行不能是中文注释**：无 BOM 的 UTF-8 下，PS 5.1 会把行尾吞掉，导致后面的 `param(` 解析失败。把 `param(` 放第一行。
2. **热键回调别用 PowerShell 事件**：`$form.add_Pressed({...})` 在 `RegisterHotKey` 场景下不触发。改成 C# 里自己 `GetMessage` 循环 + 直接截图，稳。
---

## 截图后直接粘贴（0.2.1）

区域选完松手，除了存 PNG，**图片同时进了剪贴板**。

所以：

1. 按热键 → 拖框 → 松手
2. 回 DSH 输入框，直接 **Ctrl+V**
3. 图就贴进去了

## 中文乱码的修复

脚本原先存成「无 BOM 的 UTF-8」，PowerShell 5.1 会按 GBK 解析，导致 C# 里的中文字符串全变乱码。
现在改成 **UTF-8 with BOM**（文件头 `EF BB BF`），`param` 和中文都正常了。

## 覆盖层卡住的修复

加了 `OnDeactivate`：覆盖层一失去焦点就自动关闭，不会留一个看不见的窗口把后续热键吃掉。