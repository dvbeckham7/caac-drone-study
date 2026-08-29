const allQuestions = window.CAAC_QUESTIONS || [];
const savedScope = localStorage.getItem('caac-selected-scope');
let selectedChapter = savedScope === 'all' ? 'all' : Number(savedScope) || 1;
const getChapterQuestions = (chapter) => allQuestions
  .filter((question) => chapter === 'all' || question.chapter === chapter)
  .map((question) => [question.question, question.options, question.answer, question.id, question.tip, question.memoryType, question.reviewStatus, question.reviewNote]);
let questions = getChapterQuestions(selectedChapter);
const STORAGE_KEY='caac-ch1-v2';
const DAY_MS = 24 * 60 * 60 * 1000;
const DAILY_TARGET = 20;

function defaultCardState(){
  return { status: 'new', due: 0, interval: 0, ease: 2.5, reps: 0, result: null, last: 0 };
}

function normalizeState(raw){
  const next = { version: 1, currentIndex: 0, currentId: null, currentByChapter: {}, daily: null, cards: {}, answerStats: {} };
  if (!raw || typeof raw !== 'object') return next;
  if (typeof raw.currentId === 'string') next.currentId = raw.currentId;
  if (raw.currentByChapter && typeof raw.currentByChapter === 'object') next.currentByChapter = { ...raw.currentByChapter };
  if (raw.daily && typeof raw.daily === 'object') next.daily = { ...raw.daily };
  if (raw.answerStats && typeof raw.answerStats === 'object') next.answerStats = { ...raw.answerStats };
  if (raw.cards && typeof raw.cards === 'object') {
    if (Number.isInteger(raw.currentIndex) && raw.currentIndex >= 0 && raw.currentIndex < questions.length) {
      next.currentIndex = raw.currentIndex;
    }
    Object.assign(next.cards, raw.cards);
    return next;
  }
  Object.keys(raw).forEach((key) => {
    if (key === 'currentIndex' || key === 'version') return;
    const value = raw[key];
    if (typeof value === 'string') {
      next.cards[key] = {
        ...defaultCardState(),
        status: value === 'easy' ? 'easy' : value === 'hard' ? 'hard' : 'new',
        result: value === 'easy' ? 'easy' : value === 'hard' ? 'hard' : null,
        due: 0
      };
    }
  });
  return next;
}

let index=0,flipped=false,mode='study',wrongReview=false,retryQueue=[],revealed=true,state=normalizeState(JSON.parse(localStorage.getItem(STORAGE_KEY) || localStorage.getItem('caac-ch1') || '{}'));
let examQuestions = [], examAnswers = [], examIndex = 0, examEndsAt = 0, examTimerId = null, examSubmitted = false;
function getFreshStartIndex(questionCount){
  return questionCount > 1 ? 1 + Math.floor(Math.random() * (questionCount - 1)) : 0;
}
const savedChapterIndex = state.currentByChapter[selectedChapter];
if (Number.isInteger(savedChapterIndex) && savedChapterIndex >= 0 && savedChapterIndex < questions.length) index = savedChapterIndex;
if (!Number.isInteger(savedChapterIndex) && state.currentId) {
  const savedIndex = questions.findIndex((question) => question[3] === state.currentId);
  if (savedIndex >= 0) index = savedIndex;
}
if (!Number.isInteger(savedChapterIndex) && !state.currentId && questions.length > 1) index = getFreshStartIndex(questions.length);
const $=s=>document.querySelector(s); const save=()=>{ state.currentIndex=index; state.currentId=questions[index]?.[3] || null; state.currentByChapter[selectedChapter]=index; localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); };
const esc=value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');

function todayKey(){ return new Date().toISOString().slice(0, 10); }

function getDailyTask(){
  if (!state.daily || state.daily.date !== todayKey()) {
    state.daily = { date: todayKey(), target: DAILY_TARGET, completed: 0, rewardClaimed: false };
    save();
  }
  return state.daily;
}

function recordDailyAnswer(){
  const daily = getDailyTask();
  daily.completed += 1;
  if (daily.completed >= daily.target) daily.rewardClaimed = true;
  save();
}

function getGlobalStats(){
  const cards = allQuestions.map((question) => ({ ...defaultCardState(), ...(state.cards[question.id] || {}) }));
  return { done: cards.filter((card) => card.result).length, wrong: cards.filter((card) => card.result === 'hard').length };
}

function renderPlan(){
  const stats = getGlobalStats();
  const daily = getDailyTask();
  const stage = mode === 'exam'
    ? { label: '当前阶段：考试迁移', hint: '进入正式模拟，检验十章混合答题能力。' }
    : stats.done < allQuestions.length
      ? { label: '当前阶段：逐章通关', hint: '先完成各章节题目，答错题会自动回放。' }
      : stats.wrong > 0
        ? { label: '当前阶段：错题回放', hint: '优先重做错题，直到能稳定答对。' }
        : { label: '当前阶段：每日巩固', hint: '基础题库已完成，按每日任务保持记忆。' };
  $('#stageLabel').textContent = stage.label;
  $('#stageHint').textContent = stage.hint;
  $('#dailyTask').textContent = `今日任务：${Math.min(daily.completed, daily.target)} / ${daily.target} 题`;
  $('#dailyReward').textContent = daily.rewardClaimed ? '奖励已获得' : '奖励：完成标记';
}

const availableChapters = [...new Set(allQuestions.map((question) => question.chapter))].sort((a, b) => a - b);
function isChapterComplete(chapter){
  return allQuestions.filter((question) => question.chapter === chapter)
    .every((question) => state.cards[question.id]?.result);
}

function isChapterUnlocked(chapter){
  return chapter === 1 || isChapterComplete(chapter - 1);
}

function isAllChaptersComplete(){
  return availableChapters.every((chapter) => isChapterComplete(chapter));
}

function getUnlockedChapter(){
  return availableChapters.find((chapter) => isChapterUnlocked(chapter)) || 1;
}

if (selectedChapter !== 'all' && (!availableChapters.includes(selectedChapter) || !isChapterUnlocked(selectedChapter))) selectedChapter = getUnlockedChapter();

function renderChapterLevels(){
  const allComplete = isAllChaptersComplete();
  $('#examTab').disabled = !allComplete;
  $('#chapterLevels').innerHTML = availableChapters.map((chapter) => {
    const complete = isChapterComplete(chapter);
    const unlocked = isChapterUnlocked(chapter);
    return `<button class="level-btn${chapter === selectedChapter ? ' active' : ''}${complete ? ' complete' : ''}" data-chapter="${chapter}" ${unlocked ? '' : 'disabled'} type="button">第 ${chapter} 关${complete ? ' ✓' : ''}</button>`;
  }).join('') + `<button class="level-btn${selectedChapter === 'all' ? ' active' : ''}" data-chapter="all" ${allComplete ? '' : 'disabled'} type="button">十章混合</button>`;
}

renderChapterLevels();
$('#chapterLevels').onclick = (event) => {
  const button = event.target.closest('[data-chapter]');
  if (!button || button.disabled) return;
  selectedChapter = button.dataset.chapter === 'all' ? 'all' : Number(button.dataset.chapter);
  questions = getChapterQuestions(selectedChapter);
  index = Number.isInteger(state.currentByChapter[selectedChapter])
    ? state.currentByChapter[selectedChapter]
    : getFreshStartIndex(questions.length);
  wrongReview = false;
  retryQueue = [];
  localStorage.setItem('caac-selected-scope', String(selectedChapter));
  save();
  renderChapterLevels();
  render();
};

function getCardState(i){
  const key = questions[i]?.[3] || i;
  return { ...defaultCardState(), ...(state.cards[key] || state.cards[i] || {}) };
}

function setCardState(i, payload){
  const key = questions[i]?.[3] || i;
  state.cards[key] = { ...getCardState(i), ...payload };
  save();
}

function getDueCards(){
  const now = Date.now();
  return questions.map((_, i) => i).filter((i) => {
    const card = getCardState(i);
    return !card.result || card.status === 'hard' || card.due <= now;
  });
}

function getNextIndex(current = 0, skipCurrent = false){
  const candidates = questions.map((_, i) => i).filter((i) => !skipCurrent || i !== current);
  const pickRandom = (items) => items[Math.floor(Math.random() * items.length)];
  const wrong = candidates.filter((i) => getCardState(i).status === 'hard');
  if (wrong.length) return pickRandom(wrong);

  const due = candidates.filter((i) => {
    const card = getCardState(i);
    return card.result && card.due <= Date.now();
  });
  if (due.length) return pickRandom(due);

  const unreviewed = candidates.filter((i) => !getCardState(i).result);
  if (unreviewed.length) return pickRandom(unreviewed);

  if (!candidates.length) return current;
  return pickRandom(candidates);
}

function recordAnswer(cardIndex, level){
  const card = getCardState(cardIndex);
  const now = Date.now();
  const prevEase = Number(card.ease) || 2.5;
  const prevInterval = Number(card.interval) || 0;

  if (level === 'hard') {
    setCardState(cardIndex, {
      status: 'hard',
      result: 'hard',
      due: now + 60 * 1000,
      interval: 0,
      ease: Math.max(1.4, prevEase - 0.3),
      reps: (card.reps || 0) + 1,
      last: now
    });
    return;
  }

  const safeInterval = Math.max(1, prevInterval || 1);
  const nextInterval = level === 'mid'
    ? Math.max(1, Math.round(safeInterval * Math.max(1.3, prevEase * 0.9)))
    : Math.max(2, Math.round(safeInterval * prevEase));
  const nextEase = level === 'easy'
    ? Math.min(3.3, prevEase + 0.2)
    : Math.max(1.7, prevEase - 0.1);

  setCardState(cardIndex, {
    status: level === 'easy' ? 'easy' : 'mid',
    result: level,
    due: now + nextInterval * DAY_MS,
    interval: nextInterval,
    ease: nextEase,
    reps: (card.reps || 0) + 1,
    last: now
  });
}

function getStats(){
  const cards = questions.map((_, i) => getCardState(i));
  const done = cards.filter((card) => card.result).length;
  const wrong = cards.filter((card) => card.result === 'hard').length;
  const easy = cards.filter((card) => card.result === 'easy').length;
  const due = cards.filter((card) => !card.result || card.status === 'hard' || card.due <= Date.now()).length;
  return { done, wrong, easy, due };
}

function getAccuracyStats(){
  const ids = new Set(allQuestions.filter((question) => selectedChapter === 'all' || question.chapter === selectedChapter).map((question) => question.id));
  const stats = [...ids].reduce((result, id) => {
    const item = state.answerStats[id];
    if (item) {
      result.attempts += Number(item.attempts) || 0;
      result.correct += Number(item.correct) || 0;
    }
    return result;
  }, { attempts: 0, correct: 0 });
  return { ...stats, accuracy: stats.attempts ? Math.round((stats.correct / stats.attempts) * 100) : null };
}

function recordAnswerStats(questionId, correct){
  const current = state.answerStats[questionId] || { attempts: 0, correct: 0 };
  state.answerStats[questionId] = {
    attempts: current.attempts + 1,
    correct: current.correct + (correct ? 1 : 0)
  };
  save();
}

function renderMemoryGuide(memoryType, tip){
  const note = tip ? `<div class="guide-note">${esc(tip)}</div>` : '';
  const boundaryMatch = tip && tip.match(/(?:[≤≥<>]=?\s*\d+(?:\.\d+)?\s*(?:米|公里|kg|m\/s|A|V)?|\d+(?:\.\d+)?\s*(?:米|公里|kg|m\/s|A|V)?(?:（不含）)?(?:以上|以下|以内|之外)?)/);
  const boundaryLabel = boundaryMatch ? boundaryMatch[0].trim() : '本题边界';
  if (memoryType === 'range-distance') {
    return `<div class="memory-guide"><b>距离标尺（km）</b><div class="scale"><span>≤15</span><span>15–50</span><span>50–200</span><span>200–800</span><span>&gt;800</span></div><div class="scale-labels"><span>超近</span><span>近程</span><span>中近</span><span>中程</span><span>远程</span></div>${note}</div>`;
  }
  if (memoryType === 'range-radius') {
    return `<div class="memory-guide"><b>活动半径标尺（km）</b><div class="scale"><span>0</span><span>≤15</span><span>15–50</span><span>50–200</span><span>&gt;200</span></div><div class="scale-labels"><span></span><span>超近程</span><span>近程</span><span>中程</span><span>远程</span></div>${note}</div>`;
  }
  if (memoryType === 'range-height') {
    return `<div class="memory-guide"><b>任务高度标尺（m）</b><div class="scale"><span>0</span><span>50</span><span>100</span><span>1000</span></div><div class="scale-labels height-labels"><span>地面</span><span></span><span>超低空上限</span><span>更高</span></div>${note}</div>`;
  }
  if (memoryType === 'classification') {
    return `<div class="memory-guide"><b>按空机质量看四档</b><div class="classification-ruler"><div><strong>微型</strong><span>≤7kg</span></div><div><strong>轻型</strong><span>&gt;7–116kg</span></div><div><strong>中型</strong><span>&gt;116–5700kg</span></div><div><strong>大型</strong><span>&gt;5700kg</span></div></div>${note}</div>`;
  }
  if (memoryType === 'heavy-classification') {
    return `<div class="memory-guide"><b>高质量段标尺</b><div class="classification-ruler heavy"><div><strong>XI类</strong><span>&gt;116–5700kg</span></div><div><strong>XII类</strong><span>&gt;5700kg</span></div></div>${note}</div>`;
  }
  if (memoryType === 'threshold') {
    return `<div class="memory-guide"><b>只记这个边界</b><div class="threshold-number">${esc(boundaryLabel)}</div><div class="threshold-value">${note}</div></div>`;
  }
  if (memoryType === 'dual-range') {
    return `<div class="memory-guide"><b>双栏范围</b><div class="dual-range"><span>空机质量</span><span>起飞全重</span></div><div class="dual-range muted"><span>看左栏</span><span>再看右栏</span></div>${note}</div>`;
  }
  if (memoryType === 'dual-threshold') {
    return `<div class="memory-guide"><b>双边界</b><div class="dual-range"><span>半径 500m</span><span>高度 &lt;120m</span></div><div class="dual-range muted"><span>两个条件</span><span>同时满足</span></div>${note}</div>`;
  }
  if (memoryType === 'formula') return `<div class="memory-guide"><b>记公式</b><div class="formula-guide"><span>已知量</span><strong>→</strong><span>换算关系</span><strong>→</strong><span>答案量</span></div>${note}</div>`;
  if (memoryType === 'relationship') return `<div class="memory-guide"><b>因果关系</b><div class="formula-guide"><span>条件变化</span><strong>→</strong><span>结果变化</span></div>${note}</div>`;
  if (memoryType === 'composition') return `<div class="memory-guide"><b>组成清单</b><div class="dual-range"><span>组成项 A</span><span>组成项 B</span></div><div class="dual-range muted"><span>组成项 C</span><span>组成项 D</span></div>${note}</div>`;
  if (memoryType === 'sequence') return `<div class="memory-guide"><b>顺序记忆</b><div class="formula-guide"><span>① 起点</span><strong>→</strong><span>② 中段</span><strong>→</strong><span>③ 终点</span></div>${note}</div>`;
  return '';
}

function renderReviewNote(status, note){
  if (!note || status === 'unreviewed') return '';
  return `<div class="review-note"><b>题库核对</b>${esc(note)}</div>`;
}

function render(){
  const q = questions[index];
  const card = getCardState(index);
  const answered = !!card.result;
  const chapterLabel = selectedChapter === 'all' ? '十章混合' : `第 ${selectedChapter} 章`;

  $('#chapterEyebrow').textContent = `CAAC 认证 · ${chapterLabel}`;
  $('#listTitle').textContent = `${chapterLabel}题目`;
  $('#cardNo').textContent = String(index + 1).padStart(2, '0');
  $('#progressLabel').textContent = `第 ${index + 1} / ${questions.length} 张`;
  $('#cardTag').textContent = answered ? '已练习' : '记忆挑战';
  $('#cardContent').innerHTML = `<div>${esc(q[0])}</div>`;
  $('#recallInstruction').hidden = !!answered || revealed;
  $('#recallBtn').hidden = !!answered || revealed;
  $('#choiceList').hidden = !answered && !revealed;
  $('#choiceList').innerHTML = q[1].map((x, i) => `
    <button class="choice" data-choice="${i}" ${answered ? 'disabled' : ''}>
      <span>${String.fromCharCode(65 + i)}</span>${esc(x)}
    </button>
  `).join('');
  $('#feedback').hidden = !answered;
  $('#continueBtn').hidden = !answered;
  $('#flipTip').hidden = true;

  if (answered) {
    const isCorrect = card.result === 'easy' || card.result === 'mid';
    const memoryGuide = renderMemoryGuide(q[5], q[4]);
    const tipText = memoryGuide ? '' : `<span>${esc(q[4] || '')}</span>`;
    $('#feedback').className = 'feedback ' + (isCorrect ? 'good' : 'retry');
    $('#feedback').innerHTML = isCorrect
      ? `<b>答对了！</b><br>${tipText}${memoryGuide}${renderReviewNote(q[6], q[7])}`
      : `<b>这题先记住：${String.fromCharCode(65 + q[2])}. ${esc(q[1][q[2]])}</b><br>${tipText}${memoryGuide}${renderReviewNote(q[6], q[7])}`;
    document.querySelectorAll('.choice').forEach((b, i) => {
      if (i === q[2]) b.classList.add('correct');
      if (!isCorrect && i !== q[2]) b.classList.add('muted');
    });
  }

  const stats = getStats();
  const pct = Math.round((stats.done / questions.length) * 100);
  const ringText = $('#ringText');
  const ring = $('#ring');
  const wrongCount = $('#wrongCount');
  const progressHint = $('#progressHint');
  const accuracyLabel = $('#accuracyLabel');
  const accuracyStats = getAccuracyStats();

  if (ringText) ringText.textContent = pct + '%';
  if (ring) ring.style.background = `conic-gradient(#64d9b2 ${pct * 3.6}deg, #dfeaf7 0deg)`;
  if (wrongCount) wrongCount.textContent = String(stats.wrong);
  if (progressHint) progressHint.textContent = stats.wrong > 0 ? '长期记忆' : '记忆强度';
  if (accuracyLabel) accuracyLabel.textContent = accuracyStats.accuracy === null
    ? '本章准确率：暂无数据'
    : `本章准确率：${accuracyStats.accuracy}%（${accuracyStats.correct}/${accuracyStats.attempts}）`;
  renderChapterLevels();
  renderPlan();
}

function choose(i){
  if (getCardState(index).result) return;
  const correct = i === questions[index][2];
  recordAnswerStats(questions[index][3], correct);
  recordAnswer(index, correct ? 'easy' : 'hard');
  recordDailyAnswer();
  if (!correct && !wrongReview && !retryQueue.some((item) => item.index === index)) {
    retryQueue.push({ index, remaining: 3 });
  }
  render();
}

function next(){
  if (wrongReview) {
    const remainingWrong = questions.map((_, i) => i)
      .filter((i) => i !== index && getCardState(i).result === 'hard');
    if (remainingWrong.length) {
      index = remainingWrong[0];
      save();
      render();
      return;
    }
    wrongReview = false;
  }
  retryQueue.forEach((item) => { item.remaining -= 1; });
  const retry = retryQueue.find((item) => item.remaining <= 0 && item.index !== index);
  if (retry) {
    retryQueue = retryQueue.filter((item) => item !== retry);
    index = retry.index;
    save();
    render();
    return;
  }
  index = getNextIndex(index, true);
  save();
  render();
}

function showMode(m){
  if (mode === 'exam' && m !== 'exam') stopExamTimer();
  mode = m;
  document.querySelectorAll('.tab').forEach((x) => x.classList.toggle('active', x.dataset.mode === m));
  $('#studyView').hidden = m !== 'study';
  $('#listView').hidden = m !== 'all';
  $('#wrongView').hidden = m !== 'wrong';
  $('#examView').hidden = m !== 'exam';
  if (m === 'all' || m === 'wrong') renderList();
  if (m === 'exam') {
    if (!examQuestions.length || examSubmitted) startExam();
    renderExam();
  }
}

function shuffle(items){
  return [...items].sort(() => Math.random() - 0.5);
}

function startExam(){
  stopExamTimer();
  examQuestions = shuffle(allQuestions.filter((question) => question.type === '单选题')).slice(0, 100);
  examAnswers = Array(examQuestions.length).fill(null);
  examIndex = 0;
  examEndsAt = Date.now() + 120 * 60 * 1000;
  examSubmitted = false;
  $('#examResult').hidden = true;
  examTimerId = setInterval(updateExamTimer, 1000);
  updateExamTimer();
}

function stopExamTimer(){
  if (examTimerId) clearInterval(examTimerId);
  examTimerId = null;
}

function updateExamTimer(){
  if (examSubmitted) return;
  const remaining = Math.max(0, examEndsAt - Date.now());
  const totalSeconds = Math.ceil(remaining / 1000);
  $('#examTimer').textContent = `${String(Math.floor(totalSeconds / 60)).padStart(3, '0')}:${String(totalSeconds % 60).padStart(2, '0')}`;
  if (!remaining) submitExam();
}

function renderExam(){
  const question = examQuestions[examIndex];
  if (!question) return;
  $('#examProgress').textContent = `第 ${examIndex + 1} / ${examQuestions.length} 题`;
  $('#examQuestion').textContent = question.question;
  $('#examChoices').innerHTML = question.options.map((option, optionIndex) => `
    <button class="choice ${examAnswers[examIndex] === optionIndex ? 'exam-selected' : ''}" data-exam-choice="${optionIndex}" type="button">
      <span>${String.fromCharCode(65 + optionIndex)}</span>${esc(option)}
    </button>
  `).join('');
  $('#examPrev').disabled = examIndex === 0;
  $('#examNext').hidden = examIndex === examQuestions.length - 1;
  $('#examSubmit').hidden = examIndex !== examQuestions.length - 1;
}

function submitExam(){
  if (examSubmitted) return;
  examSubmitted = true;
  stopExamTimer();
  const correct = examQuestions.reduce((total, question, questionIndex) => total + (examAnswers[questionIndex] === question.answer ? 1 : 0), 0);
  const passed = correct >= 80;
  const result = $('#examResult');
  result.className = `exam-result${passed ? '' : ' fail'}`;
  result.innerHTML = `<b>${passed ? '理论考试合格' : '理论考试未合格'}</b><br>得分：${correct} / 100<br>合格线：80 分`;
  result.hidden = false;
  $('#examPrev').hidden = true;
  $('#examNext').hidden = true;
  $('#examSubmit').hidden = true;
}

function renderList(){
  const arr = mode === 'wrong'
    ? questions.map((q, i) => [q, i]).filter(([, i]) => getCardState(i).result === 'hard')
    : questions.map((q, i) => [q, i]);
  $('#emptyWrong').hidden = arr.length > 0;
  $('#listCount').textContent = arr.length + ' 题';
  $('#questionList').innerHTML = arr.map(([q, i]) => `
    <button class="question-item" data-question-index="${i}" type="button">
      <span class="qnum">${String(i + 1).padStart(2, '0')}</span>
      <div>
        <div class="qtext">${esc(q[0])}</div>
        <div class="qans">答案：${String.fromCharCode(65 + q[2])}. ${esc(q[1][q[2]])}</div>
      </div>
    </button>
  `).join('');
  $('#wrongList').innerHTML = mode === 'wrong' ? $('#questionList').innerHTML : '';
}

function retryCard(cardIndex){
  const card = getCardState(cardIndex);
  setCardState(cardIndex, { status: 'new', result: null, due: 0, last: card.last });
  index = cardIndex;
  wrongReview = true;
  save();
  showMode('study');
  render();
}

$('#choiceList').onclick = (e) => {
  const b = e.target.closest('.choice');
  if (!b || b.disabled || getCardState(index).result) return;
  choose(Number(b.dataset.choice));
};
$('#wrongList').onclick = (e) => {
  const item = e.target.closest('[data-question-index]');
  if (item) retryCard(Number(item.dataset.questionIndex));
};
$('#continueBtn').onclick = next;
$('#examChoices').onclick = (e) => {
  const choice = e.target.closest('[data-exam-choice]');
  if (!choice || examSubmitted) return;
  examAnswers[examIndex] = Number(choice.dataset.examChoice);
  renderExam();
};
$('#examPrev').onclick = () => { if (examIndex > 0) { examIndex -= 1; renderExam(); } };
$('#examNext').onclick = () => { if (examIndex < examQuestions.length - 1) { examIndex += 1; renderExam(); } };
$('#examSubmit').onclick = submitExam;
document.querySelectorAll('.tab').forEach((x) => x.onclick = () => showMode(x.dataset.mode));
$('#resetBtn').onclick = () => {
  if (confirm('确定清空本章复习进度吗？')) {
    state = { version: 1, currentIndex: 0, currentId: null, currentByChapter: {}, daily: null, cards: {}, answerStats: {} };
    index = getFreshStartIndex(questions.length);
    wrongReview = false;
    retryQueue = [];
    save();
    renderChapterLevels();
    showMode('study');
    render();
  }
};

if (!Number.isInteger(state.currentByChapter[selectedChapter])) {
  index = state.currentId
    ? index
    : getFreshStartIndex(questions.length);
}
render();
