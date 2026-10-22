# 上架清单

已经准备好的东西在这个目录里：

- `OWNER__dsh-weather-whisper.yml` —— 市场条目，把 `OWNER` 换成你的 GitHub 用户名即可
- 上一级的整个插件仓库（package.json / cordis.patch.yml / index.js / lib/client.js / README / LICENSE / screenshots.json / assets）
- `..\dsh-weather-whisper-0.3.0.tgz` —— 预构建 tarball

## 还差的三步（都需要你的 GitHub 账号）

1. **建仓库并推送**

   ```bash
   cd C:\DSH专用文件夹\工作区\dsh-weather-whisper
   git init
   git add .
   git commit -m "feat: weather whisper 0.3.0 with theme editor"
   git branch -M main
   git remote add origin https://github.com/OWNER/dsh-weather-whisper.git
   git push -u origin main
   ```

   然后把仓库 Topics 加上 `dsh-plugin`（仓库首页右侧齿轮 → Topics）。

2. **发一个 Release，挂上 tarball**

   Release 标签用 `v0.3.0`，把 `dsh-weather-whisper-0.3.0.tgz` 作为 asset 上传。
   地址会变成 `.../releases/download/v0.3.0/dsh-weather-whisper-0.3.0.tgz`，和条目里的 `tarball:` 对上。
   （不发 Release 也能上架，市场会改成从源码构建；有 tarball 安装更快、也不用 allowBuilds 授权。）

3. **提 PR 到 awesome-dsh-plugin**

   - fork `https://github.com/awesome-dsh-plugin/awesome-dsh-plugin`
   - 把 `OWNER__dsh-weather-whisper.yml` 放进 `data/plugins/`，文件名换成你的用户名
   - 提 PR，标题写 `Add OWNER/dsh-weather-whisper (ui)`

   CI 会检查：`dsh.bundle` 清单（本包已有）、仓库创建满 1 天、描述是否属实、README 能否重新生成。
   合并后站点和 dsh-market 会自动收录，一般一天内生效。

## 注意事项

- 仓库必须是**公开**的，且创建满 1 天；今天刚建的仓库提交会被 CI 挡回，隔天再提即可。
- 描述不要写夸张词，审核会对着代码核对。
- 想要商店里显示下载量，可以再 `npm publish`（需要 npm 账号，仓库的 `repository` 字段要指回 GitHub 仓库）。