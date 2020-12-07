# nhk-record

## Dependencies
- [Node.js](https://github.com/nodejs/node)
- [FFmpeg](https://github.com/FFmpeg/FFmpeg)

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
  -a, --assets-url         NHK assets url (for JS & thumbnails)         [string]
  -b, --safety-buffer      Number of extra milliseconds to record before and
                           after scheduled airtime                      [number]
  -c, --config             Location of config file                      [string]
  -d, --save-dir           Directory in which to save recorded programmes
                                                                        [string]
  -f, --log-file           Location of log file                         [string]
  -i, --stream-url         URL from which to record stream              [string]
  -k, --log-level-console  Logging level to output to console
                            [string] [choices: "debug", "info", "error", "none"]
  -l, --log-level-file     Logging level to output to log file
                            [string] [choices: "debug", "info", "error", "none"]
  -m, --match-pattern      Glob pattern of desired program name (can be used
                           multiple times)                               [array]
  -s, --schedule-url       NHK schedule API url                         [string]
  -t, --minimum-duration   Minimum programme run time to record in milliseconds
                                                                        [number]
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
  "streamUrl": "https://nhkwlive-ojp.akamaized.net/hls/live/2003459/nhkwlive-ojp/index_4M.m3u8"
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
