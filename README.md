# 老杨游戏站 · OpenClaw

从 `http://49.233.148.25/` 迁移至 GitHub Pages。

## 包含内容

| 页面 | 文件 | 说明 |
|------|------|------|
| B-Plan | `b-plan.html` | 飞行类游戏 |
| 中国象棋 | `xiangqi.html` | 经典对弈 |
| 围棋 | `weiqi.html` | 围棋 / 对弈 |
| Shadow Ninja | `shadow-ninja.html` | 忍者 / 动作 |
| 鹈鹕骑行 | `pelican-ride.html` | SVG 2D 动画 · 点击切换 |
| 地块地图 | `map/index.html` | 卫星图叠加 / 图斑标注 |
| 全息闪卡 | `holo-card/index.html` | 3D 镭射收藏卡 · 交互视差 |

## 本地预览

```bash
# 方式一：Python 内置服务器
python3 -m http.server 8000

# 方式二：Node.js 静态服务器
npx serve
```

然后访问 `http://localhost:8000`。

## 启用 GitHub Pages

1. 进入仓库 **Settings → Pages**
2. **Source** 选择 `Deploy from a branch`
3. **Branch** 选择 `main`，文件夹选 `/ (root)`
4. 保存后等待几分钟，即可通过 `https://<用户名>.github.io/<仓库名>/` 访问
