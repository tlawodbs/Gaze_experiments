# Analysis Output — 산출물 설명

`analysis/analysis.ipynb`를 실행하면 이 폴더(`analysis/analysis_output/`)에 집계 CSV 4개와
그림 PNG 4개가 생성됩니다. 아래는 각 파일이 무엇인지에 대한 설명입니다.

## 이번 실행 요약 (현재 데이터 기준)

- **데이터 경로**: `data/` (레포 루트). 현재 **P01, P02** 두 명의 데이터만 존재하며,
  P03~P06 폴더는 비어 있어 자동으로 무시됩니다.
- **발견된 run**: 6개 (P01·P02 × Day 1/2/3), 각 run당 60시행(연습 10 + 실험 50).
- **분석 대상 시행**: 실험 세션만 사용 → 총 **300시행** (연습 60시행 제외).
- **분석된 확정 선택(키 입력)**: **1,500건**, 그중 오류 **116건(7.7%)**.
- 데이터를 추가/수정한 뒤 노트북을 다시 실행하면 이 폴더의 파일이 모두 갱신됩니다.

> 재실행 방법 (anaconda 파이썬 사용):
> ```bash
> cd analysis
> /opt/anaconda3/bin/jupyter nbconvert --to notebook --execute --inplace analysis.ipynb
> ```

---

## 그림 (PNG)

### `learning_curves.png`
Day 1 → Day 2 → Day 3 학습 곡선. **WPM(분당 단어 수)**, **정확도(accuracy)**,
**문구당 오류 수(errors per phrase)** 세 지표를 일자별로 표시합니다.
얇은 선 = 참가자 개별값, 굵은 검은 선 = 참가자 평균. 학습에 따른 수행 변화(RQ 학습 대조)를 봅니다.

### `early_late_by_day.png`
**RQ1 핵심 그림.** 오류 선택을 **early-trigger**(눈이 목표 키에 도달하기 전에 손이 먼저 발화)와
**late-trigger**(눈이 목표 키를 떠난 뒤에 손이 늦게 발화)로 분류해, 일자별 누적 막대로 그 비율을 보여줍니다.
주황 = early, 파랑 = late.

### `trigger_offset_by_day.png`
**RQ2 그림.** 연속형 **트리거 오프셋**(`t_sel − t_on_target`, ms) 분포를 일자별 히스토그램(빈도)으로
겹쳐 표시합니다. 0 기준 왼쪽(음수)=early, 오른쪽(양수)=late.

⚠️ **on-time 제외**: 전체 선택의 약 96%(1,445/1,498)가 on-time이며, 이들은 측정값이 아닌
sentinel 값 `offset=0`으로 기록됩니다. 이 0들을 그대로 그리면 0 지점에 거대한 막대 하나만 서고
실제 타이밍 분포가 가려지므로, 이 그림은 **offset≠0인 실제 early/late 선택(현재 53건, 전부 late)만**
표시하고 on-time 비율은 제목에 별도 표기합니다. (전체 평균/중앙 오프셋은 on-time 0을 포함한 값이
`session_metrics.csv`·`day_metrics.csv`의 `mean/median_trigger_offset_ms`에 있습니다.)

### `rq3_scatter.png`
**RQ3 그림.** (참가자, 일자) 단위 점들에 대해 오류 패턴 지표(late/early 비율, 트리거 오프셋 등)와
수행 지표(WPM, 정확도)의 관계를 산점도로 표시합니다. 표본이 적어(현재 n=6) 기술적 참고용입니다.

이번 실행의 Pearson r (n=6, 참고용):

| 관계 | r |
|------|---|
| late_share_of_err vs WPM | −0.192 |
| late_share_of_err vs accuracy | −0.310 |
| early_share_of_err vs WPM | +0.526 |
| early_share_of_err vs accuracy | +0.555 |
| mean_trigger_offset_ms vs WPM | −0.558 |
| error_rate_per_keystroke vs WPM | −0.897 |

### `nasa_tlx_by_day.png` / `nasa_tlx.csv`
**주관적 작업부하(NASA-TLX).** 설문으로 수집한 6개 하위척도(정신·신체·시간 요구, 수행/성공,
노력, 좌절)를 참가자별 패널의 일자별 그룹 막대로 표시합니다(0–20 척도). Performance만 높을수록
"성공적"(부하 낮음), 나머지는 높을수록 부하 큼. `nasa_tlx.csv`에는 원자료와 함께 `RTLX`(6척도
평균, Performance는 20−값으로 역코딩한 종합 작업부하)가 들어 있습니다. 노트북 산출물이 아니라
설문 데이터로 별도 생성됩니다.

---

## 집계 데이터 (CSV)

### `trial_performance.csv` — 시행별 (가장 세밀한 단위)
실험 시행 1행 = 1문구. 원본 `day_summary.csv` 컬럼에 노트북이 계산한 지표를 덧붙입니다.

주요 컬럼: `participant_id`, `day`, `session_label`, `trial_id`, `target_word`, `typed_text`,
`duration_ms`, `error_count`, `character_error_rate`, 그리고 노트북 계산값
`wpm`(MacKenzie WPM), `entry_seconds`(첫→마지막 키 입력 시간), `accuracy`(=1−CER),
`errors_per_phrase`(=error_count).

### `selection_events.csv` — 확정 선택(키 입력)별
커밋된 글자 1개 = 1행 (총 1,500행). early/late 분류의 원자료입니다.

컬럼: `participant_id`, `day`, `session_label`, `trial_id`, `input_index`,
`target_char`(의도한 글자), `selected_character`(실제 입력된 글자),
`is_error`(둘이 다른지), `label`(`early`/`late`/`on_time`/`no_target_fix`),
`offset_ms`(트리거 오프셋, 음수=early·양수=late), `dist_px`(발화 시점 시선–목표키 거리).

### `session_metrics.csv` — (참가자, 일자, 세션)별 집계
각 실험 세션 단위로 수행·오류·시선 지표를 롤업합니다.

주요 컬럼: `mean_wpm`, `mean_errors_per_phrase`, `mean_cer`, `mean_accuracy`, `n_trials`,
`n_selections`, `n_errors`, `error_rate_per_keystroke`, `n_late_err`, `n_early_err`,
`late_share_of_err`, `early_share_of_err`, `mean_trigger_offset_ms`, `median_trigger_offset_ms`,
`mean_fixation_ms`(평균 응시 지속시간), `mean_corrective_saccades`(교정 saccade 프록시).

### `day_metrics.csv` — (참가자, 일자)별 집계
학습 대조의 핵심 단위. 세션들을 (참가자, 일자)로 평균낸 표이며, 학습 곡선·RQ3 상관의 입력이 됩니다.
컬럼 구성은 `session_metrics.csv`에서 세션 식별자·카운트 컬럼을 뺀 평균 지표들입니다.

---

## 지표 정의 메모

- **WPM**: `(|typed| − 1) / 5 × (60 / 입력초)`. 입력초는 첫 커밋부터 마지막 커밋까지
  (MacKenzie & Soukoreff 관례), 불가 시 시행 `duration_ms`로 폴백.
- **early / late / on_time**: 트리거 시점 `t_sel`이 시선이 목표 키에 머문 구간
  `[t_enter, t_leave]`의 앞(±80ms 허용오차)이면 early, 뒤면 late, 안이면 on_time.
  웹캠 시선 추적 노이즈가 있으므로 조작적 정의이며 임계값(`ON_TIME_TOL_MS`,
  `GAZE_SEARCH_BEFORE/AFTER_MS` 등)에 따라 달라집니다.
- **mean_fixation_ms**: I-DT 분산 기반 응시 검출기(`FIX_DISPERSION_PX=60`,
  `FIX_MIN_DURATION_MS=80`)의 평균 응시 길이 (프록시).
- **mean_corrective_saccades**: 글자 커밋 전 시선이 목표 키로 재진입한 횟수 (프록시).

> 참고: 교정 없이(no correction) 입력하는 과제라 오타가 그대로 보존되며, 이것이 협응 오류를
> 그대로 읽어낼 수 있게 해 줍니다.
