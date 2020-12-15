# nhk-record

## Dependencies
- [Node.js](https://github.com/nodejs/node) `>= 15.x`
- [FFmpeg](https://github.com/FFmpeg/FFmpeg) `>= 4.x`

## Installing
```
git clone git@github.com:nhkrecord/nhk-record.git
cd nhk-record
npm install
```

## Running
```
npm start -- [options]
```

## Configuration
Options can be specified via the CLI or via a config file.

### Command line
```
      --help               Show help                                   [boolean]
      --version            Show version number                         [boolean]
  -a, --assets-url         NHK assets url (for JS & thumbnails)
                                    [string] [default: "https://www3.nhk.or.jp"]
  -b, --safety-buffer      Number of extra milliseconds to record before and
                           after scheduled airtime     [number] [default: 40000]
  -c, --config             Location of config file                      [string]
  -d, --save-dir           Directory in which to save recorded programmes
                                              [string] [default: "/recordings/"]
  -f, --log-file           Location of log file
                                      [string] [default: "/logs/nhk-record.log"]
  -i, --stream-url         URL from which to record stream
  [string] [default: "https://nhkwlive-ojp.akamaized.net/hls/live/2003459/nhkwli
                                                       ve-ojp-en/index_4M.m3u8"]
  -k, --log-level-console  Logging level to output to console
         [string] [choices: "debug", "info", "error", "none"] [default: "debug"]
  -l, --log-level-file     Logging level to output to log file
         [string] [choices: "debug", "info", "error", "none"] [default: "debug"]
  -m, --match-pattern      Glob pattern of desired program name (can be used
                           multiple times)              [array] [default: ["*"]]
  -o, --time-offset        Time offset relative to system time in milliseconds
                           (e.g. to handle stream delays)  [number] [default: 0]
  -s, --schedule-url       NHK schedule API url
                                     [string] [default: "https://api.nhk.or.jp"]
  -t, --minimum-duration   Minimum programme run time to record in milliseconds
                                                      [number] [default: 240000]
```

### Config file
The location of the config file can be specified with the `-c` option.

```
{
  "assetsUrl": "https://www3.nhk.or.jp",
  "logFile": "/logs/nhk-record.log",
  "logLevelConsole": "debug",
  "logLevelFile": "debug",
  "matchPattern": ["*"],
  "minimumDuration": 240000,
  "safetyBuffer": 40000,
  "saveDir": "/recordings/",
  "scheduleUrl": "https://api.nhk.or.jp",
  "streamUrl": "https://nhkwlive-ojp.akamaized.net/hls/live/2003459/nhkwlive-ojp-en/index_4M.m3u8",
  "timeOffset": 0
}
```

### Match pattern format
Match patterns use [micromatch](https://github.com/micromatch/micromatch). For example:
| Description                  | Pattern                                      |
|------------------------------|----------------------------------------------|
| Match everything             | `["*"]`                                      |
| Japanology and Lunch ON!     | `["*japanology*", "*lunch*"]`                |
| Everything except Newsline   | `["!(*newsline*\|*nl bridge*)"]`             |

## Running as a docker container

Docker images are available on [Docker Hub](https://hub.docker.com/r/nhkrecord/nhk-record)

Example docker-compose.yml:

```
version: "3.7"
services:
  nhk-record:
    image: nhkrecord/nhk-record:latest
    restart: unless-stopped
    volumes:
      - "/path/to/my/config.json:/config.json:ro"
      - "/path/to/my/recordings/:/recordings/"
      - "/var/log/nhk-record/:/logs/"
    environment:
      - UID=1000
      - GID=1000
```
