# msbao

<!-- [![npm](https://img.shields.io/npm/v/koishi-plugin-msbao?style=flat-square)](https://www.npmjs.com/package/koishi-plugin-msbao) -->
<p align="center">

<img src="https://visitor-badge.laobi.icu/badge?page_id=MilkteaDoll.MilkteaDoll" alt="visitors"/>
<a href="https://www.npmjs.com/package/koishi-plugin-msbao"><img src="https://img.shields.io/npm/v/koishi-plugin-msbao?style=flat-square"></a>
</p>



# 主要功能为“%查岗”与“%查询”指令
- 指令“%查询 ID”查询TMS角色信息
- 指令“%查岗 ID”查看角色最近7天经验变化
---
# whitelistMode
- 是否开启白名单模式（开启后仅白名单群生效）
## whitelist
- 允许回复的群号（私聊不限制，私聊全会回复）
- ---
# admins
- 管理员QQ号 （不一定得是群管理，此功能暂时无效）
- ---
# URL.Lists
  ### 自定义查询指令
- ### URL.lists[*].name
  - 触发指令
- ### URL.lists[*].websites
  - 执行回复的内容
- ### URL.lists[*].useGlobalwlist
  - 是否套用全局白名单
- ### URL.lists[*].selfWhitelst
  - 若不套用全局白名单则使用此处的独立白名单

*例如触发指令填写“%百度”，在执行回复内填写'www.baidu.com'*
*则如果群内有人发送“%百度”时机器人自动回复网站*
# Key.keywrods
---
- 通过正则表达式检测群内聊天是否包含某词执行回复自定义内容
# apiKey
- Nexon-API 密钥
- ---
# ms.queryInterval
- 查岗时使用的sleep延迟，避免短时间大量查询导致崩溃（
- ---
# ms.images
- 查岗时最后附带上的图片，如填写多个则随机一张进行发送
- 图片放在lib目录下
- ---
*随便写的，能用就行*