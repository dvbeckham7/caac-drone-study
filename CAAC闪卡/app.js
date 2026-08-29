const allQuestions = window.CAAC_QUESTIONS || [];
const savedScope = localStorage.getItem('caac-selected-scope');
let selectedChapter = savedScope === 'all' ? 'all' : Number(savedScope) || 1;
const toTuple = (question) => [question.question, question.options, question.answer, question.id, question.tip, question.memoryType, question.reviewStatus, question.reviewNote, question.specItems];
const getChapterQuestions = (chapter) => allQuestions
  .filter((question) => chapter === 'all' || question.chapter === chapter)
  .map(toTuple);
let questions = getChapterQuestions(selectedChapter);
let activeScopeKey = selectedChapter;
const STORAGE_KEY='caac-ch1-v2';
const DAY_MS = 24 * 60 * 60 * 1000;
const DAILY_TARGET = 20;

function defaultCardState(){
  return { status: 'new', due: 0, interval: 0, ease: 2.5, reps: 0, result: null, last: 0 };
}

function normalizeState(raw){
  const next = { version: 1, currentIndex: 0, currentId: null, currentByChapter: {}, daily: null, cards: {}, answerStats: {}, selectedAnswers: {} };
  if (!raw || typeof raw !== 'object') return next;
  if (typeof raw.currentId === 'string') next.currentId = raw.currentId;
  if (raw.currentByChapter && typeof raw.currentByChapter === 'object') next.currentByChapter = { ...raw.currentByChapter };
  if (raw.daily && typeof raw.daily === 'object') next.daily = { ...raw.daily };
  if (raw.answerStats && typeof raw.answerStats === 'object') next.answerStats = { ...raw.answerStats };
  if (raw.selectedAnswers && typeof raw.selectedAnswers === 'object') next.selectedAnswers = { ...raw.selectedAnswers };
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

let index=0,flipped=false,currentScreen='menu',subView='study',wrongReview=false,currentAnswered=false,retryQueue=[],reinforcementQueue=[],revealed=true,state=normalizeState(JSON.parse(localStorage.getItem(STORAGE_KEY) || localStorage.getItem('caac-ch1') || '{}'));
let examQuestions = [], examAnswers = [], examIndex = 0, examEndsAt = 0, examTimerId = null, examSubmitted = false;
let calendarMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
function getFreshStartIndex(questionCount){
  return questionCount > 1 ? 1 + Math.floor(Math.random() * (questionCount - 1)) : 0;
}
function restoreIndex(){
  const savedChapterIndex = state.currentByChapter[activeScopeKey];
  if (Number.isInteger(savedChapterIndex) && savedChapterIndex >= 0 && savedChapterIndex < questions.length) {
    index = savedChapterIndex;
    return;
  }
  const savedIndex = state.currentId ? questions.findIndex((question) => question[3] === state.currentId) : -1;
  if (savedIndex >= 0) {
    index = savedIndex;
    return;
  }
  index = questions.length > 1 ? getFreshStartIndex(questions.length) : 0;
}
restoreIndex();
const $=s=>document.querySelector(s); const save=()=>{ state.currentIndex=index; state.currentId=questions[index]?.[3] || null; state.currentByChapter[activeScopeKey]=index; localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); };
const esc=value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');

function dateKey(date = new Date()){
  const utc8Date = new Date(date.getTime() + 8 * 60 * 60 * 1000);
  return `${utc8Date.getUTCFullYear()}-${String(utc8Date.getUTCMonth() + 1).padStart(2, '0')}-${String(utc8Date.getUTCDate()).padStart(2, '0')}`;
}

function todayKey(){ return dateKey(); }

function compareDateKeys(left, right){ return left < right ? -1 : left > right ? 1 : 0; }

function migrateDailyState(){
  if (!state.daily || typeof state.daily !== 'object') {
    state.daily = { target: DAILY_TARGET, records: {} };
    return;
  }
  if (!state.daily.records || typeof state.daily.records !== 'object') state.daily.records = {};
  if (state.daily.date && !state.daily.records[state.daily.date]) {
    state.daily.records[state.daily.date] = {
      date: state.daily.date,
      target: DAILY_TARGET,
      completed: Math.min(Number(state.daily.completed) || 0, DAILY_TARGET),
      questionIds: Array.isArray(state.daily.questionIds) ? state.daily.questionIds : [],
      checkedInAt: state.daily.completed >= DAILY_TARGET ? (state.daily.completedAt || new Date().toISOString()) : null
    };
  }
  state.daily.target = DAILY_TARGET;
}

function createDailyRecord(date){
  return { date, target: DAILY_TARGET, completed: 0, questionIds: [], checkedInAt: null };
}

function getDailyTask(){
  migrateDailyState();
  const today = todayKey();
  if (!state.daily.records[today]) state.daily.records[today] = createDailyRecord(today);
  const daily = state.daily.records[today];
  daily.target = DAILY_TARGET;
  daily.completed = Math.min(Number(daily.completed) || 0, DAILY_TARGET);
  if (daily.completed >= DAILY_TARGET && !daily.checkedInAt) daily.checkedInAt = new Date().toISOString();
  state.daily.date = today;
  state.daily.completed = daily.completed;
  state.daily.questionIds = daily.questionIds;
  save();
  return daily;
}

function recordDailyAnswer(){
  const daily = getDailyTask();
  if (daily.checkedInAt) return;
  daily.completed = Math.min(daily.completed + 1, DAILY_TARGET);
  if (daily.completed >= daily.target) daily.checkedInAt = new Date().toISOString();
  state.daily.completed = daily.completed;
  save();
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

if (selectedChapter !== 'all' && (!availableChapters.includes(selectedChapter) || !isChapterUnlocked(selectedChapter))) {
  selectedChapter = getUnlockedChapter();
  activeScopeKey = selectedChapter;
  questions = getChapterQuestions(selectedChapter);
  restoreIndex();
}

function getDailyPool(){
  const daily = getDailyTask();
  const unlocked = new Set(availableChapters.filter(isChapterUnlocked));
  const available = allQuestions.filter((question) => unlocked.has(question.chapter));
  const availableIds = new Set(available.map((question) => question.id));
  const savedIds = Array.isArray(daily.questionIds)
    ? daily.questionIds.filter((id) => availableIds.has(id))
    : [];
  const questionIds = savedIds.length === DAILY_TARGET
    ? savedIds
    : shuffle(available).slice(0, DAILY_TARGET).map((question) => question.id);
  daily.questionIds = questionIds;
  state.daily.questionIds = questionIds;
  save();
  const questionsById = new Map(available.map((question) => [question.id, question]));
  return questionIds.map((id) => questionsById.get(id)).filter(Boolean).map(toTuple);
}

function renderDailyCalendar(){
  const today = todayKey();
  const todayDate = `${Number(today.slice(5, 7))}月${Number(today.slice(8, 10))}日`;
  $('#calendarToday').textContent = `今天 · ${today.slice(0, 4)}年${todayDate}`;
  const year = calendarMonth.getFullYear();
  const month = calendarMonth.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < firstDay; i += 1) cells.push('<span class="calendar-day empty" aria-hidden="true"></span>');
  for (let day = 1; day <= daysInMonth; day += 1) {
    const key = dateKey(new Date(year, month, day));
    const record = state.daily?.records?.[key];
    const comparison = compareDateKeys(key, today);
    const status = comparison > 0 ? 'future' : record?.checkedInAt ? 'checked' : comparison < 0 ? 'expired' : 'today';
    const label = status === 'checked' ? '已签到' : status === 'expired' ? '' : status === 'future' ? '未开放' : `${Math.min(record?.completed || 0, DAILY_TARGET)}/${DAILY_TARGET}`;
    cells.push(`<span class="calendar-day ${status}" title="${key} · ${label}"><b>${day}</b><small>${label}</small></span>`);
  }
  $('#calendarTitle').textContent = `${year} 年 ${month + 1} 月`;
  $('#dailyCalendarGrid').innerHTML = cells.join('');
  const now = new Date();
  $('#calendarPrev').disabled = year < now.getFullYear() - 1;
  $('#calendarNext').disabled = year > now.getFullYear() || (year === now.getFullYear() && month >= now.getMonth());
  $('#dailyCalendarStatus').textContent = state.daily?.records?.[today]?.checkedInAt ? '今日已签到，明天继续' : '完成今日目标后自动记录签到';
  $('#dailyCalendarStatus').style.display = 'none';
}

function renderChapterLevels(){
  const allComplete = isAllChaptersComplete();
  $('#chapterLevels').innerHTML = availableChapters.map((chapter) => {
    const complete = isChapterComplete(chapter);
    const unlocked = isChapterUnlocked(chapter);
    return `<button class="level-btn${chapter === selectedChapter ? ' active' : ''}${complete ? ' complete' : ''}" data-chapter="${chapter}" ${unlocked ? '' : 'disabled'} type="button">第 ${chapter} 关${complete ? ' ✓' : ''}</button>`;
  }).join('') + `<button class="level-btn${selectedChapter === 'all' ? ' active' : ''}" data-chapter="all" ${allComplete ? '' : 'disabled'} type="button">十章混合</button>`;
}

function renderMenu(){
  const chapterForCard = selectedChapter === 'all' ? getUnlockedChapter() : selectedChapter;
  const chapterQs = getChapterQuestions(chapterForCard);
  const chapterDone = chapterQs.filter((q) => state.cards[q[3]]?.result).length;
  $('#modeChaptersDesc').textContent = `第 ${chapterForCard} 章 · ${chapterDone}/${chapterQs.length} 题已练习`;

  const daily = getDailyTask();
  $('#modeDailyDesc').textContent = daily.completed >= DAILY_TARGET
    ? '今日目标已完成，可继续复习'
    : `今日 ${Math.min(daily.completed, daily.target)}/${daily.target} 题`;

  const allDone = isAllChaptersComplete();
  $('#modeExam').disabled = !allDone;
  $('#modeExamDesc').textContent = allDone ? '十章已解锁，随时开考' : '完成全部章节后解锁';
}

function renderScreens(){
  $('#menuView').hidden = currentScreen !== 'menu';
  $('#modeBar').hidden = currentScreen === 'menu';
  $('#modeBar').classList.toggle('daily-mode', currentScreen === 'daily');
  $('#chapterLevels').hidden = currentScreen !== 'chapters';
  $('#studyView').hidden = !((currentScreen === 'chapters' || currentScreen === 'daily') && subView === 'study');
  $('#wrongView').hidden = !((currentScreen === 'chapters' || currentScreen === 'daily') && subView === 'wrong');
  $('#completionView').hidden = !((currentScreen === 'chapters' || currentScreen === 'daily') && subView === 'completion');
  $('#examView').hidden = currentScreen !== 'exam';
  $('#resetBtn').hidden = currentScreen !== 'chapters';
  $('#dailyCalendar').hidden = currentScreen !== 'daily';
  if (currentScreen === 'daily') renderDailyCalendar();
  if ((currentScreen === 'chapters' || currentScreen === 'daily') && subView === 'wrong') renderWrongList();
  if ((currentScreen === 'chapters' || currentScreen === 'daily') && subView === 'completion') renderCompletion();
}

function isCurrentScopeComplete(){
  if (currentScreen === 'daily') return getDailyTask().completed >= DAILY_TARGET;
  if (currentScreen === 'chapters' && selectedChapter !== 'all') return isChapterComplete(selectedChapter);
  return currentScreen === 'chapters' && selectedChapter === 'all' && isAllChaptersComplete();
}

function renderCompletion(){
  const daily = currentScreen === 'daily';
  const stats = getStats();
  const accuracy = getAccuracyStats();
  $('#completionTitle').textContent = daily ? '今日签到完成！' : '本章完成！';
  $('#completionMessage').textContent = daily
    ? '20 道题已完成，今日签到已记录。'
    : `第 ${selectedChapter} 章已完成，可以整理错题或进入下一章。`;
  $('#completionDone').textContent = daily ? `${DAILY_TARGET}/${DAILY_TARGET}` : `${stats.done}/${questions.length}`;
  $('#completionAccuracy').textContent = accuracy.accuracy === null ? '--' : `${accuracy.accuracy}%`;
  const nextChapter = !daily && selectedChapter !== 'all'
    ? availableChapters.find((chapter) => chapter > selectedChapter)
    : null;
  $('#completionNext').hidden = !nextChapter;
  if (nextChapter) $('#completionNext').textContent = `解锁第 ${nextChapter} 章 →`;
  $('#completionWrong').hidden = stats.wrong === 0;
  $('#completionContinue').textContent = daily ? '继续复习本日题目' : '继续复习本章题目';
}

function enterChapters(){
  currentScreen = 'chapters';
  activeScopeKey = selectedChapter;
  questions = getChapterQuestions(selectedChapter);
  restoreIndex();
  wrongReview = false;
  currentAnswered = false;
  retryQueue = [];
  reinforcementQueue = [];
  subView = isCurrentScopeComplete() ? 'completion' : 'study';
  renderChapterLevels();
  renderScreens();
  render();
}

function enterDaily(){
  currentScreen = 'daily';
  activeScopeKey = 'daily';
  questions = getDailyPool();
  restoreIndex();
  wrongReview = false;
  currentAnswered = false;
  retryQueue = [];
  reinforcementQueue = [];
  subView = isCurrentScopeComplete() ? 'completion' : 'study';
  renderScreens();
  render();
}

function enterExam(){
  if (!isAllChaptersComplete()) return;
  currentScreen = 'exam';
  renderScreens();
  if (!examQuestions.length || examSubmitted) {
    startExam();
  } else if (!examTimerId) {
    examTimerId = setInterval(updateExamTimer, 1000);
    updateExamTimer();
  }
  renderExam();
}

function enterMenu(){
  if (currentScreen === 'exam') stopExamTimer();
  currentScreen = 'menu';
  renderScreens();
  renderMenu();
}

$('#chapterLevels').onclick = (event) => {
  const button = event.target.closest('[data-chapter]');
  if (!button || button.disabled) return;
  selectedChapter = button.dataset.chapter === 'all' ? 'all' : Number(button.dataset.chapter);
  activeScopeKey = selectedChapter;
  questions = getChapterQuestions(selectedChapter);
  restoreIndex();
  wrongReview = false;
  currentAnswered = false;
  retryQueue = [];
  reinforcementQueue = [];
  localStorage.setItem('caac-selected-scope', String(selectedChapter));
  save();
  subView = isCurrentScopeComplete() ? 'completion' : 'study';
  renderChapterLevels();
  renderScreens();
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

function hasPendingReview(){
  return wrongReview || retryQueue.length > 0 || reinforcementQueue.length > 0;
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
  const ids = new Set(questions.map((question) => question[3]));
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

function renderMemoryGuide(memoryType, tip, specItems, isCorrect){
  const note = tip ? `<div class="guide-note">${esc(tip)}</div>` : '';
  const wrap = (content) => `<div class="memory-guide"><div class="mat-header"><span>MA</span><em>记忆辅助</em></div>${content}</div>`;
  const boundaryMatch = tip && tip.match(/(?:[≤≥<>]=?\s*\d+(?:\.\d+)?\s*(?:米|公里|kg|m\/s|A|V)?|\d+(?:\.\d+)?\s*(?:米|公里|kg|m\/s|A|V)?(?:（不含）)?(?:以上|以下|以内|之外)?)/);
  const boundaryLabel = boundaryMatch ? boundaryMatch[0].trim() : '';
  if (memoryType === 'range-distance') {
    return wrap(`<b>距离标尺（km）</b><div class="scale"><span>≤15</span><span>15–50</span><span>50–200</span><span>200–800</span><span>&gt;800</span></div><div class="scale-labels"><span>超近</span><span>近程</span><span>中近</span><span>中程</span><span>远程</span></div>${note}`);
  }
  if (memoryType === 'range-radius') {
    return wrap(`<b>活动半径标尺（km）</b><div class="scale"><span>0</span><span>≤15</span><span>15–50</span><span>50–200</span><span>&gt;200</span></div><div class="scale-labels"><span></span><span>超近程</span><span>近程</span><span>中程</span><span>远程</span></div>${note}`);
  }
  if (memoryType === 'range-height') {
    return wrap(`<b>任务高度标尺（m）</b><div class="scale"><span>0</span><span>50</span><span>100</span><span>1000</span></div><div class="scale-labels height-labels"><span>地面</span><span></span><span>超低空上限</span><span>更高</span></div>${note}`);
  }
  if (memoryType === 'classification') {
    return wrap(`<b>按空机质量看四档</b><div class="classification-ruler"><div><strong>微型</strong><span>≤7kg</span></div><div><strong>轻型</strong><span>&gt;7–116kg</span></div><div><strong>中型</strong><span>&gt;116–5700kg</span></div><div><strong>大型</strong><span>&gt;5700kg</span></div></div>${note}`);
  }
  if (memoryType === 'full-classification' && Array.isArray(specItems) && specItems.length) {
    const items = specItems.map(([label, value, active]) => {
      const details = String(value).split('；').map((item) => `<span>${esc(item)}</span>`).join('');
      return `<div class="${active ? 'active' : ''}"><strong>${esc(label)}</strong><span class="ruler-details">${details}</span></div>`;
    }).join('');
    return wrap(`<b>完整类别标尺（由小到大）</b><div class="classification-ruler full">${items}</div>${note}`);
  }
  if (memoryType === 'heavy-classification') {
    return wrap(`<b>高质量段标尺</b><div class="classification-ruler heavy"><div><strong>XI类</strong><span>&gt;116–5700kg</span></div><div><strong>XII类</strong><span>&gt;5700kg</span></div></div>${note}`);
  }
  if (memoryType === 'threshold') {
    return wrap(`${boundaryLabel ? `<div class="threshold-number">${esc(boundaryLabel)}</div>` : ''}<div class="threshold-value">${note}</div>`);
  }
  if (memoryType === 'spec-list') {
    const items = Array.isArray(specItems) && specItems.length
      ? `<div class="spec-list">${specItems.map(([label, value]) => `<div><strong>${esc(label)}</strong>${value ? `<span>${esc(value)}</span>` : ''}</div>`).join('')}</div>`
      : '';
    return wrap(`${items}${note}`);
  }
  if (memoryType === 'formula' || memoryType === 'relationship' || memoryType === 'composition' || memoryType === 'sequence') return wrap(note);
  return '';
}

function renderReviewNote(status, note){
  if (!note || status === 'unreviewed') return '';
  return `<div class="review-note"><b>题库核对</b>${esc(note)}</div>`;
}

function render(){
  const q = questions[index];
  if (!q) return;
  const card = getCardState(index);
  const answered = currentAnswered;
  const chapterLabel = selectedChapter === 'all' ? '十章混合' : `第 ${selectedChapter} 章`;

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
    const selectedAnswer = state.selectedAnswers[q[3]];
    const isCorrect = Number.isInteger(selectedAnswer)
      ? selectedAnswer === q[2]
      : card.result === 'easy' || card.result === 'mid';
    const memoryGuide = renderMemoryGuide(q[5], q[4], q[8], isCorrect);
    const tipText = memoryGuide ? '' : `<span>${esc(q[4] || '')}</span>`;
    $('#feedback').className = 'feedback ' + (isCorrect ? 'good' : 'retry');
    $('#feedback').innerHTML = isCorrect
      ? `<b>答对了！</b><br>${tipText}${memoryGuide}${renderReviewNote(q[6], q[7])}`
      : `<b>正确答案：${String.fromCharCode(65 + q[2])}. ${esc(q[1][q[2]])}</b><br>${tipText}${memoryGuide}${renderReviewNote(q[6], q[7])}`;
    document.querySelectorAll('.choice').forEach((b, i) => {
      if (i === q[2]) b.classList.add('correct');
      if (Number.isInteger(selectedAnswer) && i === selectedAnswer && !isCorrect) b.classList.add('wrong');
      if (!isCorrect && i !== q[2]) b.classList.add('muted');
    });
  }

  const stats = getStats();
  const daily = getDailyTask();
  const progressDone = currentScreen === 'daily' ? Math.min(daily.completed, DAILY_TARGET) : stats.done;
  const progressTotal = currentScreen === 'daily' ? DAILY_TARGET : questions.length;
  const pct = Math.round((progressDone / progressTotal) * 100);
  const modeBarTitle = currentScreen === 'daily'
    ? (daily.completed >= DAILY_TARGET ? '每日签到 · 已完成' : '每日签到')
    : `${chapterLabel} · 逐章刷题`;
  const modeBarFill = $('#modeBarFill');
  const modeBarCount = $('#modeBarCount');
  const wrongCount = $('#wrongCount');
  const progressHint = $('#progressHint');
  const accuracyStats = getAccuracyStats();

  $('#modeBarTitle').textContent = modeBarTitle;
  if (modeBarFill) modeBarFill.style.width = pct + '%';
  if (modeBarCount) modeBarCount.textContent = `${progressDone}/${progressTotal}`;
  if (wrongCount) wrongCount.textContent = String(stats.wrong);
  if (progressHint) progressHint.textContent = stats.wrong > 0 ? '长期记忆' : '记忆强度';
  $('#accuracyChip').textContent = accuracyStats.accuracy === null ? '准确率 --' : `准确率 ${accuracyStats.accuracy}%`;
  renderChapterLevels();
  renderScreens();
  renderMenu();
}

function choose(i){
  if (currentAnswered) return;
  const correct = i === questions[index][2];
  state.selectedAnswers[questions[index][3]] = i;
  recordAnswerStats(questions[index][3], correct);
  recordAnswer(index, correct ? 'easy' : 'hard');
  recordDailyAnswer();
  currentAnswered = true;
  if (!correct && !wrongReview && !retryQueue.some((item) => item.index === index)) {
    retryQueue.push({ index, remaining: 3 });
  }
  if (isCurrentScopeComplete() && !hasPendingReview()) subView = 'completion';
  render();
}

function next(){
  currentAnswered = false;
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
    reinforcementQueue.push({ index: retry.index, remaining: 1 + Math.floor(Math.random() * 2) });
    index = retry.index;
    save();
    render();
    return;
  }
  reinforcementQueue.forEach((item) => { item.remaining -= 1; });
  const reinforcement = reinforcementQueue.find((item) => item.remaining <= 0 && item.index !== index);
  if (reinforcement) {
    reinforcementQueue = reinforcementQueue.filter((item) => item !== reinforcement);
    index = reinforcement.index;
    save();
    render();
    return;
  }
  index = getNextIndex(index, true);
  save();
  render();
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

function renderWrongList(){
  const arr = questions.map((q, i) => [q, i]).filter(([, i]) => getCardState(i).result === 'hard');
  $('#emptyWrong').hidden = arr.length > 0;
  $('#wrongList').innerHTML = arr.map(([q, i]) => `
    <button class="question-item" data-question-index="${i}" type="button">
      <span class="qnum">${String(i + 1).padStart(2, '0')}</span>
      <div>
        <div class="qtext">${esc(q[0])}</div>
        <div class="qans">答案：${String.fromCharCode(65 + q[2])}. ${esc(q[1][q[2]])}</div>
      </div>
    </button>
  `).join('');
}

function retryCard(cardIndex){
  index = cardIndex;
  wrongReview = true;
  currentAnswered = false;
  retryQueue = [];
  reinforcementQueue = [];
  save();
  subView = 'study';
  renderScreens();
  render();
}

function continueFromCompletion(){
  subView = 'study';
  currentAnswered = false;
  retryQueue = [];
  reinforcementQueue = [];
  renderScreens();
  render();
}

function enterNextChapter(){
  const nextChapter = availableChapters.find((chapter) => chapter > selectedChapter);
  if (!nextChapter || !isChapterUnlocked(nextChapter)) return;
  selectedChapter = nextChapter;
  activeScopeKey = selectedChapter;
  questions = getChapterQuestions(selectedChapter);
  localStorage.setItem('caac-selected-scope', String(selectedChapter));
  restoreIndex();
  wrongReview = false;
  currentAnswered = false;
  retryQueue = [];
  reinforcementQueue = [];
  subView = 'study';
  save();
  renderChapterLevels();
  renderScreens();
  render();
}

$('#choiceList').onclick = (e) => {
  const b = e.target.closest('.choice');
  if (!b || b.disabled || currentAnswered) return;
  choose(Number(b.dataset.choice));
};
$('#wrongList').onclick = (e) => {
  const item = e.target.closest('[data-question-index]');
  if (item) retryCard(Number(item.dataset.questionIndex));
};
$('#continueBtn').onclick = next;
$('#modeChapters').onclick = enterChapters;
$('#modeDaily').onclick = enterDaily;
$('#calendarToggle').onclick = () => {
  const calendar = $('#dailyCalendar');
  const expanded = calendar.classList.toggle('expanded');
  $('#calendarToggle').setAttribute('aria-expanded', String(expanded));
};
$('#calendarPrev').onclick = () => { calendarMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1); renderDailyCalendar(); };
$('#calendarNext').onclick = () => { calendarMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1); renderDailyCalendar(); };
$('#modeExam').onclick = enterExam;
$('#backBtn').onclick = enterMenu;
$('#completionHome').onclick = enterMenu;
$('#completionNext').onclick = enterNextChapter;
$('#completionWrong').onclick = () => { subView = 'wrong'; renderScreens(); renderWrongList(); };
$('#completionContinue').onclick = continueFromCompletion;
$('#wrongChip').onclick = () => { subView = 'wrong'; renderScreens(); renderWrongList(); };
$('#examChoices').onclick = (e) => {
  const choice = e.target.closest('[data-exam-choice]');
  if (!choice || examSubmitted) return;
  examAnswers[examIndex] = Number(choice.dataset.examChoice);
  renderExam();
};
$('#examPrev').onclick = () => { if (examIndex > 0) { examIndex -= 1; renderExam(); } };
$('#examNext').onclick = () => { if (examIndex < examQuestions.length - 1) { examIndex += 1; renderExam(); } };
$('#examSubmit').onclick = submitExam;
function closeResetChoice(){
  $('#resetChoice').hidden = true;
}

function resetProgress(scope){
  if (scope === 'global') {
    state = normalizeState({});
    selectedChapter = 1;
    activeScopeKey = selectedChapter;
    questions = getChapterQuestions(selectedChapter);
    localStorage.removeItem('caac-ch1');
    localStorage.setItem('caac-selected-scope', String(selectedChapter));
  } else {
    const chapterQuestions = getChapterQuestions(selectedChapter);
    chapterQuestions.forEach((question) => {
      const id = question[3];
      delete state.cards[id];
      delete state.answerStats[id];
      delete state.selectedAnswers[id];
    });
    delete state.currentByChapter[selectedChapter];
  }
  wrongReview = false;
  retryQueue = [];
  reinforcementQueue = [];
  currentAnswered = false;
  index = getFreshStartIndex(questions.length);
  closeResetChoice();
  save();
  renderMenu();
  renderChapterLevels();
  subView = 'study';
  renderScreens();
  render();
}

$('#resetBtn').onclick = () => {
  const chapterName = selectedChapter === 'all' ? '当前全部题目' : `第 ${selectedChapter} 章`;
  $('#resetChoiceMessage').textContent = `本章重置只清除${chapterName}，全局重置会清除全部学习记录。`;
  $('#resetChapter').textContent = selectedChapter === 'all' ? '重置当前全部题目' : `重置第 ${selectedChapter} 章`;
  $('#resetChoice').hidden = false;
};
$('#resetChapter').onclick = () => resetProgress('chapter');
$('#resetGlobal').onclick = () => resetProgress('global');
$('#resetCancel').onclick = closeResetChoice;

renderMenu();
renderScreens();
