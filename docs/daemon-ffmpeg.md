# FFmpeg 7.1.1 for YumCut Daemon

The daemon renders video through ffmpeg, so we require at least **7.1.1** to avoid merge-layer failures. These steps are verified for Ubuntu 22.04 / 24.04 / 24.10.

## 1. Remove the stock ffmpeg (optional but cleaner)

```bash
sudo apt remove ffmpeg
sudo apt autoremove
```

## 2. Add the FFmpeg 7.1.1 PPA

```bash
sudo add-apt-repository ppa:ubuntuhandbook1/ffmpeg7
sudo apt update
```

> This Ubuntu Handbook PPA maintains ffmpeg 7.x and publishes 7.1.1 builds for current LTS/interim releases.

## 3. Install ffmpeg 7.1.1

```bash
sudo apt install ffmpeg
```

If Ubuntu Pro pulls the ESM build instead of the PPA, force the origin:

```bash
sudo apt install -t "o=LP-PPA-ubuntuhandbook1-ffmpeg7" ffmpeg
```

## 4. Verify the version

```bash
ffmpeg -version
```

You should see `ffmpeg version 7.1.1-…`. The daemon now validates this on startup: if ffmpeg is older than 7.1.1 it exits immediately and prints an error, so upgrade first and then rerun `npm run daemon`.
