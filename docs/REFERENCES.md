# 方法与代码参考（2026-10-02）

下列论文仅供方法、指标与限制启发；没有复现其模型分数、精度或训练集，也没有复制下面任一仓库的代码。论文的开放阅读范围与代码许可分别列出；原始数据不自动随论文开放。

| 参考 | 实际阅读范围 | 借鉴与限制 |
|---|---|---|
| [Zhu 等，2016，Entropy 18(5) 195](https://www.mdpi.com/1099-4300/18/5/195) | 原始出版页摘要、方法概述 | 供应链金融 SME 信用风险研究；提示特征与样本不平衡问题。本项目无可校准付款标签，不照搬模型分数。开放论文不等于开放企业数据。 |
| [Xia 等，2023，Sustainability 15(2) 1087](https://www.mdpi.com/2071-1050/15/2/1087) | 原始出版页摘要 | 制造业 SME 供应链融资风险；启发同业比较。当前 1 家企业不足以比较。 |
| [Luo 等，2020，Sustainability 12(18) 7575](https://www.mdpi.com/2071-1050/12/18/7575) | 原始出版页摘要与数据方法段 | 外部公开信用数据可作为缺少内部财务时的信号；其 2017–2019 样本与银行违约标签并非本项目数据。 |
| [Zhang 等，2024，Journal of Forecasting](https://cronfa.swan.ac.uk/Record/cronfa65654) | 作者机构存档出版信息与摘要 | 新闻可作为补充线索；本项目要求官方原始文档确认，不把新闻条数作为事件数。全文出版商许可未核实，未复制内容。 |
| [Zhao 等，2023，International Review of Economics & Finance](https://www.sciencedirect.com/science/article/abs/pii/S1057521923002867) | 出版页摘要 | 详细财务数据存在时文本增益可能有限；本项目不用文本生成风险评分。全文访问与许可未核实。 |
| [MD&A 文本预警，2023，PLOS ONE](https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0291818) | 原始出版页摘要与研究设计 | 文本可读性、相似性值得研究；本项目不声称已训练或评估这些指标。 |
| [Berloco 等，2021，PLOS ONE](https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0250115) | 原始出版页摘要与方法概述 | 贸易信用网络说明延付可能沿供应链传导；本文使用的交易网络数据不在本项目。 |
| [Zhong 与 Wang，2022，AIMS Mathematics](https://www.aimspress.com/article/doi/10.3934/math.20221145?viewType=HTML) | 原始出版页摘要 | 中国制造业上市公司财务比率基线；仅用于选择可核对指标，不应用其预测成绩。 |

上述可开放阅读的 MDPI、PLOS 与 AIMS 论文各有网站上的开放访问说明；任何图表、代码或训练数据均未复制，因此本仓库没有从论文继承代码许可证。出版商受限条目只据摘要记录。

| 仓库 | README/许可/测试核对 | 本项目处理 |
|---|---|---|
| [alicexl/a-share-financials](https://github.com/alicexl/a-share-financials) | README 描述巨潮下载、PyMuPDF、SQLite 与测试；其“91 passed + 2 skipped”是仓库自述，未在本机复跑。GitHub 根目录有 `tests/`，未检测到 LICENSE 文件。 | 只借鉴来源到指标的处理思路，自己写最小导入与验算，无复制。 |
| [Deng-Yao/financial-crisis-prediction](https://github.com/Deng-Yao/financial-crisis-prediction) | 阅读仓库首页；所需 CSMAR 等数据并非随代码提供。GitHub 显示 [MIT 许可](https://github.com/Deng-Yao/financial-crisis-prediction/blob/main/LICENSE)，根目录未见测试目录，未在本机复跑。 | 不导入模型，也不把 ST 标签当交易付款结果。 |
| [NUSTM/DFDP_Dataset](https://github.com/NUSTM/DFDP_Dataset) | 阅读仓库首页；公开样本范围有限。根目录未见 LICENSE 或测试目录。 | 只用于理解字段构造，不当作尽调数据库。 |
| [NUSTM/LIM](https://github.com/NUSTM/LIM) | 阅读仓库首页；数据范围和企业映射未在本机核验。根目录未见 LICENSE 或测试目录。 | 不导入语料或实验代码。 |
| [HiroyasuInoue/ProductionNetworkSimulator](https://github.com/HiroyasuInoue/ProductionNetworkSimulator) | 阅读仓库首页；根目录未见 LICENSE 或测试目录，未在本机复跑。 | 仅理解供应链冲击传播，本轮不加入网络仿真。 |

参考只指导问题设计。页面呈现的是公开事实、用户假设与确定性现金计算，没有论文模型成绩或第三方预测结果。
