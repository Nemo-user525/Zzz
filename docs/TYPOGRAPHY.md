# 见微字体与排版

统一规则位于 `frontend/src/jianwei-typography.css`，由 `main.tsx` 在现有组件样式之后加载。

| 用途 | 字体 | 排版 |
| --- | --- | --- |
| 中文章节标题、方法页、查证页标题 | Noto Serif SC，站内名称 Jianwei Reading | 500 字重；小标题 600；适度收紧字距 |
| 正文、表单、按钮、页脚 | Segoe UI Variable Text / Segoe UI + Noto Sans SC（Jianwei Text） | 正文 400，控件 500–600；中文行高 1.75–1.95 |
| 字标与英文品牌标语 | 原有 Jianwei ZhongSong / Jianwei Editorial | 保留原有品牌构图 |
| Intro 大段手写、批注和收尾描边字 | 原有 Long Cang / Ma Shan Zheng 与描边资产 | 保留手写风格与动画 |

首页「从细微处，看见变化」及 Intro 横栏是已确认的马善政手写样式，沿用 `jianwei-motion.css` 的原有配色和放大字号，不纳入通用字体覆盖。Intro 右侧显示上海时区的当天日期，页面保持打开时也会更新。

Microsoft 字体通过操作系统调用，不额外打包。中文网页字体在 `public/fonts` 自托管，使用 `font-display: swap`；没有外部字体服务运行时请求。动态企业名称中子集未覆盖的汉字回退到微软雅黑、苹方或系统字体。

Noto 两个变量字体子集合计约 703 KiB，覆盖当前 TS、TSX、CSS 源码中的全部汉字。OFL 许可证、版本、来源链接、字符覆盖和文件散列见同目录下 `OFL-Noto*SC-Text.txt` 与 `typography-fonts.json`。修改静态文案后，可用 `frontend/scripts/build-typography-fonts.py` 重建子集；脚本需要 fonttools 和 brotli。

参考来源：

- [Microsoft：Typography in Windows](https://learn.microsoft.com/en-us/windows/apps/design/signature-experiences/typography)
- [Google Fonts：Noto Serif SC](https://fonts.google.com/specimen/Noto+Serif+SC)
- [Google Fonts：Noto Sans SC](https://fonts.google.com/specimen/Noto+Sans+SC)

检查首页首屏、Intro、档案柜、观察小队与页尾，以及 `/investigations/new`、`/method`、`/story` 和 `/examples/gym-card` 的桌面与手机排版时，注意章节标题换行、输入框 16px 字号、文字加载和页面横向溢出。观察小队本身的横向轮播是预期行为。
