# 웹 성능 측정과 최적화

2026-11-13. 목표는 웹 플레이의 끊김과 입력 지연을 10배 수준으로 줄이는 것이다. 렌더 함수 실행 시간, UI 스레드 응답 지연, 전체 장면의 프레임 간격은 서로 다른 지표다. 특정 함수가 10배 빨라진 결과를 게임 전체 FPS 10배 개선으로 해석하지 않는다.

이 문서의 전후 수치는 왕자의 토템 기능을 통합하기 전 `rush-11` / `combat-9`에서 측정한 기록이다. `rush-12` / `combat-9` 통합에서도 아래 최적화는 유지하지만, 과거 번들 크기·프레임 수치를 통합 버전의 재측정 결과로 해석하지 않는다. 통합된 토템의 Worker·온라인 전달과 종료 후 최대 HP 복구는 별도 회귀 테스트로 확인한다.

## 조사 근거

- [MDN: Optimizing canvas](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API/Tutorial/Optimizing_canvas): 반복 그리기의 사전 렌더링, 정적인 배경과 동적인 객체의 레이어 분리, 불투명 캔버스의 alpha 비활성화.
- [web.dev: Use web workers to run JavaScript off the browser's main thread](https://web.dev/articles/off-main-thread): 긴 계산을 UI 스레드에서 분리해 상호작용 지연을 줄이는 방법.
- [web.dev: Optimize long tasks](https://web.dev/articles/optimize-long-tasks): 작업을 작은 비동기 배치로 나눠 브라우저에 입력·렌더링 기회를 주는 방법.
- [React: Profiler](https://react.dev/reference/react/Profiler): 실제 렌더 비용을 확인하고 필요한 부분에 memo 경계를 두는 방법.
- [web.dev: Avoid layout thrashing](https://web.dev/articles/avoid-large-complex-layouts-and-layout-thrashing): 반복 좌표 읽기와 불필요한 레이아웃 계산을 줄이는 방법.
- [web.dev: Towards an animation smoothness metric](https://web.dev/articles/smoothness): rAF 빈도만으로 실제 화면의 부드러움을 단정할 수 없는 이유.
- [web.dev: High-performance CSS animations](https://web.dev/articles/animations-guide), [Chrome: Rendering performance](https://developer.chrome.com/docs/devtools/rendering/performance): `transform`·`opacity` 애니메이션도 실제 Layout/Paint를 추적해 확인하고, `will-change`는 측정된 필요가 있는 요소에만 적용한다.

## 적용한 변경

- 로컬 봇 전투의 전체 계산을 재사용하는 module Worker로 옮겼다. 완료된 입력 기록은 transferable buffer로 전달한다. Worker가 막힌 브라우저에서는 약 4ms 예산의 작은 배치로 나눠 계산한다. 결과가 준비될 때까지 보드의 COMBAT 상태와 버전은 유지하고, 준비 완료는 같은 버전의 전투 메타데이터로 전달한다. Node의 헤드리스 호출은 동기 실행을 유지한다.
- 시작 시 모든 페이지를 내려받지 않도록 게임·로컬 설정·온라인 페이지를 lazy loading한다.
- 정적 배경·프레임·바닥, 동적인 전투원·위험 표시·FX, HUD를 별도 캔버스로 합성한다. 배경은 카메라나 해상도가 바뀔 때, HUD는 실제 보이는 값이 바뀔 때 갱신한다. 시각적으로 정지한 카메라는 기존 idle 판정에 맞춰 정확한 영점으로 정규화한다.
- 큰 원본 이미지에 매 프레임 적용하던 흰색·저자극·기절 필터를 출력 해상도별로 캐시한다. 원본 아트와 일반 그리기는 유지하고 캐시는 이미지당 12개로 제한한다.
- 전투 화면이 보드를 완전히 덮으면 아래 보드·HUD를 숨기고 장식 애니메이션을 멈춘다. DOM 크기·좌표 앵커·3D 카메라는 유지한다.
- 보드·고정 타일·용 둥지의 memo 경계를 추가했다. 보이지 않는 데스크톱 터치 버튼의 cooldown 구독은 실행하지 않는다. 스포트라이트는 말·카메라가 움직일 때만 좌표를 읽는다. 용암은 background-position 대신 leaf transform으로 움직인다.
- 깃발·굴뚝 연기의 애니메이션을 별도 HTML 오버레이로 옮겨 내부 SVG 도형을 정적으로 유지한다. 140×130의 원본 경로·비율·레터박스·변환 원점을 유지하면서 반복 document layout을 제거했다. 카메라 WAAPI의 타이머 복귀도 스포트라이트를 깨우도록 기반 pose와 수명 정리를 연결했다.
- BGM의 완료 Promise가 버퍼를 영구 보관하지 않도록 하고, 디코딩된 긴 음악은 최대 두 곡만 유지한다. 현재 곡은 새 곡 디코딩과 기존 페이드가 끝날 때까지 재생한다. SFX 캐시는 별도다.
- 전투 정수 제곱근의 초기 경계 탐색과 봇의 매 틱 클로저 생성을 줄였다. 봇 결정 주기·규칙 수치·시드 소비는 유지했다.

## 측정 조건과 해석

Chrome 157 headless, Linux, 1440×900, DPR 1, CPU 4배 감속을 기본 조건으로 사용했다. CDP GPU 정보는 SwiftShader/SwANGLE, `gpu_compositing`·`rasterization`은 `disabled_software`였다. 전체 장면 측정은 Vite 개발 빌드다. 개발·공유 호스트·소프트웨어 렌더링 환경의 수치는 사용자의 실제 기기나 프로덕션 FPS를 보장하지 않는다.

초기 임시 측정은 seed 42의 사람 네 명과 플레이어 인계 창을 유지했다. 당시 4초 구간의 rAF 간격 p95는 보드 인계 화면 166.7ms, 용전 200.1ms였다. 에셋 준비와 연출 대기 조건을 더 명확히 기록하는 아래 CLI를 추가했으므로 이후 회귀 비교는 같은 CLI·설정·에셋·빌드에서 반복해야 한다. 게임이 실제로 마운트됐는지, 캔버스 크기·보드 가림 여부·브라우저 오류를 함께 확인한다. 빈 화면이나 HMR 실패 결과는 성능 개선으로 사용하지 않는다.

### 최종 전체 장면 측정

최종 CLI의 4초 구간이다. 아래 rAF 빈도는 프레임 제출·실제 표시 FPS와 동일한 지표가 아니다. 두 보드 행은 인계 창 유무가 달라 서로 속도 배수로 비교하지 않는다.

| 장면 | CPU 감속 | rAF/초 | 프레임 간격 p95 | 50ms 초과 간격 | document layout 횟수 |
|---|---:|---:|---:|---:|---:|
| 보드, 인계 창 유지 | 4배 | 54.9 | 16.8ms | 2 | 2 |
| 용전 | 4배 | 48.4 | 50.0ms | 6 | 1 |
| 보드, 인계 창 닫음 | 없음 | 41.7 | 50.0ms | 0 | 2 |
| 용전 | 없음 | 59.9 | 16.7ms | 0 | 1 |

일반 CPU의 두 장면에는 50ms 이상 long task가 없었다. 최종 두 실행의 브라우저 오류는 없었고 이미지·폰트와 실제 캔버스 마운트를 확인했다. 초기 임시 측정과 비교하면 보드 p95는 약 10배, 용전 p95는 약 4배 줄었지만 준비 조건이 다르므로 전체 게임 10배 달성을 입증하는 비교로 삼지 않는다.

마지막 SVG 변경 직전·직후의 동일 CLI 보드 측정에서는 CPU 4배·인계 창 유지 조건의 document layout이 56회에서 2회, p95가 183.3ms에서 16.8ms로 줄었다. 별도 2.2초 추적에서도 SVG 변경 후 document layout 0회를 확인했다. 반복 기준선의 프레임 빈도에는 공유 호스트 변동이 있으므로 이 결과 역시 모든 기기의 동일한 FPS 배수를 뜻하지 않는다. 일반 CPU에서 여러 보드 장식이 함께 움직일 때의 합성 비용은 남아 있으며, 전체 장면을 어디서나 10배 개선했다고 주장하지 않는다.

### 같은 입력의 개별 비용 비교

| 측정 | 변경 전 | 변경 후 | 해석 |
|---|---:|---:|---|
| 고정 결투 장면 렌더 평균 | 44.37ms | 3.49ms | 약 12.7배, DPR 1 |
| 흰색 피격 필터를 포함한 결투 렌더 평균 | 123.48ms | 2.98ms | 약 41.4배, DPR 1 |
| 고정 용전 장면 렌더 평균 | 27.20ms | 2.97ms | 약 9.2배, DPR 1 |
| 흰색 피격 필터를 포함한 용전 렌더 평균 | 96.76ms | 3.82ms | 약 25.3배, DPR 1 |
| 전체 전투 sim 120전 중앙 실행 시간 | 730.9ms | 669.4ms | 약 8.4% 단축, Node CPU 측정 |
| 다섯 BGM의 지속 PCM 캐시 상한 | 131.14MiB | 83.40MiB | 약 36% 감소, 48kHz stereo |
| 초기 main JS | 932.72kB | 458.38kB | 약 51% 감소, Vite 빌드 |
| 초기 main JS gzip | 318.95kB | 167.83kB | 약 47% 감소, Vite 빌드 |

렌더 비교는 같은 상태·이미지·시드로 준비된 캔버스에서 20번 반복하고 픽셀 readback으로 그리기를 완료한 값이다. 렌더 함수의 성능이며 브라우저 전체 합성·프레임 제출 시간과 같지 않다. 음악 수치는 두 곡 중 가장 큰 버퍼를 보관할 때의 상한이며 진행 중 디코딩·짧은 페이드의 일시적 참조는 제외한다.

봇 전투 12개를 연속 요청한 UI 스레드 실험에서는 heartbeat 최대 공백이 반복 측정에서 516–588ms에서 6.6–12.3ms로 줄었다. 저장소 CLI의 최종 `--fight-bench`에서도 515.6ms → 11.0ms, long task 1개 → 0개였다. 실제 Worker 응답 12개를 확인했고 전투 결과·틱 수·전체 입력 기록의 hash가 모두 같았다. 계산 전체 완료 시간과 UI 스레드가 응답하지 못한 시간은 구분한다. DevTools의 UI CPU 감속을 Worker의 동일한 CPU 감속으로 해석하지 않으며, 두 경로의 전체 완료 시간을 처리량 배수로 비교하지 않는다.

### 정확성 확인

- 160개 고정 시드 전투의 결과·최종 상태 hash·입력 기록이 계산 최적화 전후 바이트 단위로 같았다.
- DPR 1·2·3의 일반 결투·용전 고정 장면은 원본 렌더러와 픽셀이 같았다. 캐시된 필터 장면의 평균 채널 차이는 255 중 0.1 미만이었다.
- 분리 캔버스의 합성은 정지·흔들림·줌과 DPR 1·1.5·2·3을 포함한 16개 장면에서 기존 단일 캔버스와 비교했다. 최대 채널 차이는 2/255, 평균은 0.0037/255 이하였다. 배경과 HUD를 유지한 두 번째 프레임도 포함한다.
- 랜드마크는 네 애니메이션 시점의 원본·변경 화면을 비교했다. 변경하지 않은 천막은 픽셀이 같았고 전체 비교의 평균 채널 차이는 0.424/255였다. 움직이는 도형의 원점·비율은 같고 SVG 경계·그림자의 래스터화에는 작은 차이가 있다.
- HP 잔상은 같은 HP의 다음 프레임에서도 400ms 유지 후 감소하도록 회귀 테스트를 추가했다.
- Worker 준비·동일 버전 업데이트, 배치 fallback의 입력 기록 일치·취소, 정적 레이어 갱신·해상도 변경, 스포트라이트 정지·이동, BGM 퇴출·재로딩·페이드 동작을 검사한다.
- 스포트라이트는 실제 Chrome에서 정지 시 좌표 측정 1회, 카메라 이동과 타이머 복귀 중 정확한 위치 추적, 종료 후 재정지를 확인했다.
- 최종 검증: TypeScript 테스트 101개 파일·678개 테스트, Python 28개 테스트, 전체 lint·typecheck·build가 통과했다.
- Vite 프로덕션 preview에서도 홈 → 지연 로딩된 설정 → 24칸 보드 진입을 확인했다. 빌드된 64.85kB module Worker가 실제 응답했고 seed 42의 결과·2,700틱·전체 입력 hash가 개발 경로와 같았다. 브라우저 예외는 없었다.

## 재현

첫 터미널에서 개발 서버를 실행한다.

```bash
pnpm dev
```

Chrome이 설치된 환경에서 별도 터미널로 실행한다. 프로파일러는 Node 22의 내장 기능만 사용한다.

```bash
pnpm profile:web --out /tmp/dragon-rush-profile --label current --profile
pnpm profile:web --keep-handoff --cpu 4 --out /tmp/dragon-rush-profile --label handoff
pnpm profile:web --cpu 1 --out /tmp/dragon-rush-profile --label normal-cpu
pnpm profile:web --fight-bench --out /tmp/dragon-rush-profile --label worker
```

`CHROME_BIN`으로 Chrome 경로를 지정하거나 `--cdp 9223`으로 이미 실행 중인 디버그 엔드포인트를 지정할 수 있다. 컨테이너가 요구하는 경우에만 `--no-sandbox`를 사용한다. 명령은 자신이 만든 격리 컨텍스트·탭·프로세스만 정리하며 기존 탭을 닫거나 Vite를 재시작하지 않는다.

출력 JSON은 프레임 간격 p50/p95, 50ms 초과 간격, long task, script/layout/style/task 시간, DOM 좌표 읽기, 실제 장면·에셋 준비 상태, GPU 정보를 담는다. 보드·전투 PNG와 선택적인 `.cpuprofile`도 저장한다. `--fight-bench`는 화면을 숨긴 별도 구간에서 동기 계산과 Worker의 heartbeat 공백·제출 시간·입력 기록 hash를 비교한다. Worker 응답이 12개가 아니거나 기록이 다르면 실패한다. 브라우저 오류도 실패로 처리한다. 원본 프로파일은 저장소에 포함하지 않는다. 동일 조건의 결과를 여러 번 비교하고, 최종 체감은 실제 모바일·데스크톱의 프로덕션 빌드에서도 확인한다.
