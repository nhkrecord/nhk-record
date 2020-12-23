# [0.8.0](https://github.com/nhkrecord/nhk-record/compare/v0.7.2...v0.8.0) (2020-12-23)


### Features

* add auto-cropping ([76cdaf2](https://github.com/nhkrecord/nhk-record/commit/76cdaf28526a683a7e37f87cf7e16b83a0d768ce)), closes [#19](https://github.com/nhkrecord/nhk-record/issues/19)

## [0.7.2](https://github.com/nhkrecord/nhk-record/compare/v0.7.1...v0.7.2) (2020-12-20)


### Bug Fixes

* ignore orphaned .inprogress files ([#29](https://github.com/nhkrecord/nhk-record/issues/29)) ([06481a4](https://github.com/nhkrecord/nhk-record/commit/06481a4658fe1aa4669dd878c69950ca6c36abd5)), closes [#28](https://github.com/nhkrecord/nhk-record/issues/28)

## [0.7.1](https://github.com/nhkrecord/nhk-record/compare/v0.7.0...v0.7.1) (2020-12-18)


### Bug Fixes

* add missing data dir to Dockerfile ([#26](https://github.com/nhkrecord/nhk-record/issues/26)) ([fe88a38](https://github.com/nhkrecord/nhk-record/commit/fe88a388ac342d014aed53cedd44a605a1a7e8eb))

# [0.7.0](https://github.com/nhkrecord/nhk-record/compare/v0.6.0...v0.7.0) (2020-12-18)


### Bug Fixes

* fix suffix lookup ([#23](https://github.com/nhkrecord/nhk-record/issues/23)) ([dad41b1](https://github.com/nhkrecord/nhk-record/commit/dad41b10a5c21afd546ca0161dec1877d7109faf))


### Features

* automatic trimming ([#15](https://github.com/nhkrecord/nhk-record/issues/15)) ([2b8c58c](https://github.com/nhkrecord/nhk-record/commit/2b8c58c284c9876dff3fb241663ffc516340ee6e))
* write metadata for raw ([#22](https://github.com/nhkrecord/nhk-record/issues/22)) ([3c4b15a](https://github.com/nhkrecord/nhk-record/commit/3c4b15af4fa787111d30478c6a7d2390837be34c))

# [0.6.0](https://github.com/nhkrecord/nhk-record/compare/v0.5.2...v0.6.0) (2020-12-15)

### Features

- add --time-offset option ([#20](https://github.com/nhkrecord/nhk-record/issues/20)) ([5565b0a](https://github.com/nhkrecord/nhk-record/commit/5565b0aa71e53aee819a566f602ebbcc464d917c))

## [0.5.2](https://github.com/nhkrecord/nhk-record/compare/v0.5.1...v0.5.2) (2020-12-14)

### Bug Fixes

- remove -reconnect_at_eof ([#18](https://github.com/nhkrecord/nhk-record/issues/18)) ([44443d8](https://github.com/nhkrecord/nhk-record/commit/44443d8c3a4009af1d9316f37868b72c95bd70e6))

## [0.5.1](https://github.com/nhkrecord/nhk-record/compare/v0.5.0...v0.5.1) (2020-12-14)

### Bug Fixes

- retry on stream failure ([#17](https://github.com/nhkrecord/nhk-record/issues/17)) ([19a5896](https://github.com/nhkrecord/nhk-record/commit/19a58965fb7fc0e9f23974451327a3ec3dc55c83))

# [0.5.0](https://github.com/nhkrecord/nhk-record/compare/v0.4.2...v0.5.0) (2020-12-13)

### Features

- expose option defaults on command line ([#14](https://github.com/nhkrecord/nhk-record/issues/14)) ([bc69997](https://github.com/nhkrecord/nhk-record/commit/bc69997640858ee1aa65290641dc77a65cabfadd)), closes [#12](https://github.com/nhkrecord/nhk-record/issues/12)

## [0.4.2](https://github.com/nhkrecord/nhk-record/compare/v0.4.1...v0.4.2) (2020-12-08)

### Bug Fixes

- update default stream url ([40e50bb](https://github.com/nhkrecord/nhk-record/commit/40e50bb9ba7b3adc18853d8f7b1861881be8c6ab))

## [0.4.1](https://github.com/nhkrecord/nhk-record/compare/v0.4.0...v0.4.1) (2020-12-07)

### Bug Fixes

- use ISO 8601 format for metadata date ([#9](https://github.com/nhkrecord/nhk-record/issues/9)) ([44055a7](https://github.com/nhkrecord/nhk-record/commit/44055a7d4e668fef2cca4429758959c56e6b8854))

# [0.4.0](https://github.com/nhkrecord/nhk-record/compare/v0.3.0...v0.4.0) (2020-12-07)

### Features

- use mp4 metadata fields ([#6](https://github.com/nhkrecord/nhk-record/issues/6)) ([d0ff7ea](https://github.com/nhkrecord/nhk-record/commit/d0ff7ea55be932e94625cfb20f1c638a30d0e047))
