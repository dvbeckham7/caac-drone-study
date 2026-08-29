const fs = require('fs');
const path = require('path');

const root = __dirname;
const sourceDir = path.join(root, '题库源文件');
const chapterFiles = fs.readdirSync(sourceDir)
  .filter((name) => /^题库_第\d{2}章\.md$/.test(name))
  .sort();

function field(block, label) {
  const match = block.match(new RegExp(`\\*\\*${label}\\*\\*：([^\\n]*)`));
  return match ? match[1].trim() : '';
}

function parseOptions(block) {
  const optionsBlock = block.match(/\*\*选项\*\*：\n([\s\S]*?)(?=\n\*\*正确答案\*\*)/);
  if (!optionsBlock) return [];
  return optionsBlock[1].split(/\n/)
    .map((line) => line.match(/^([A-Z])\.\s?(.*)$/))
    .filter(Boolean)
    .map(([, label, text]) => ({ label, text: text.trim() }));
}

const questions = [];
const errors = [];
const chapterOneTips = [
  '距离按档位找：≤15 是超近，15–50 是近，200–800 是中。',
  '质量四档顺着记：微型≤7kg；轻型＞7–116kg；中型＞116–5700kg；大型＞5700kg。',
  'I 类从 0 开始：空机＞0kg，起飞全重≤1.5kg。',
  '超近就是最近：活动半径≤15km。',
  'III 类看两条下限：空机＞4kg、全重＞7kg；上限是 15/25。',
  '中程看区间：200–800km。',
  '多旋翼的上位概念是旋翼机。',
  '超低空贴地：0–100m。',
  '质量四档顺着记：微型≤7kg；轻型＞7–116kg；中型＞116–5700kg；大型＞5700kg。微型题还要看“空机”质量。',
  '实名登记看起飞重量：达到 250g 才登记。',
  '轻型夹在中间：7＜空机质量≤116kg；再往上是中型，116＜空机质量≤5700kg。',
  '轻型三件套：空机 7–116、速度＜100、升限＜3000。',
  'IV 类从 25kg 全重开始：空机 15–116、全重 25–150。',
  'II 类是小一档：空机 1.5–4、全重 1.5–7kg。',
  '质量分类的高段：XI类是116＜W≤5700kg，XII类是W＞5700kg。',
  '质量分类的高段：XI类是116＜W≤5700kg，XII类是W＞5700kg。',
  '多旋翼桨叶没有固定片数。',
  '“空机”不含载荷和燃料，电池仍算在内。',
  '飞艇靠浮力，归 VI 类。',
  '本体用 UAV/UA；看到 System 才选 UAS。',
  'UAS 的 S 就是 System，表示系统。',
  '植保是作业用途，对应 V 类。',
  '机翼、机身、尾翼、起落架齐全，就是固定翼。'
];
const chapterOneMemoryTypes = {
  2: 'classification',
  1: 'range-distance',
  4: 'range-radius',
  6: 'range-distance',
  8: 'range-height',
  3: 'threshold',
  9: 'classification',
  10: 'threshold',
  11: 'classification',
  12: 'spec-list',
  13: 'spec-list',
  14: 'spec-list',
  15: 'heavy-classification',
  16: 'heavy-classification'
};
const chapterOneSpecItems = {
  12: [['空机质量', '>7–116kg'], ['最大平飞速度', '<100km/h'], ['升限', '<3000m']],
  13: [['空机质量', '15–116kg'], ['起飞全重', '25–150kg']],
  14: [['空机质量', '1.5–4kg'], ['起飞全重', '1.5–7kg']]
};
const chapterTwoTips = {
  2: '3000米以下对应运动或私用；3000米以上再看商照。',
  3: '资格边界先看高度：3000米以上，选商照。',
  4: '平原农业作业：云高150米、能见度5公里。',
  6: '广阔水域渔业飞行：云高200米、能见度3公里。',
  9: '安全高度问的是最低飞行高度。',
  12: '高空空域边界：标准海平面气压6000米（不含）以上。',
  16: '视距内运行双边界：半径500米、相对高度低于120米。',
  23: '丘陵、山区、高原农业作业：云高300米、能见度5公里。'
};
const chapterTwoMemoryTypes = {
  2: 'threshold',
  3: 'threshold',
  4: 'threshold',
  6: 'threshold',
  9: 'threshold',
  12: 'threshold',
  16: 'spec-list',
  23: 'threshold'
};
const chapterTwoSpecItems = {
  16: [['半径', '500m'], ['高度', '<120m']]
};
const questionReviewData = {
  'ch08-q168': {
    status: 'source-confirmed',
    note: '题干、选项和题库答案已从第八章源文件重新确认；答案 B 仍按现有题库使用。'
  }
};
const chapterMemoryData = {
  3: {
    tips: { 1: '1:50万：图上1厘米代表地面5公里。', 2: '1海里=1.85公里。', 5: '大圆航线的核心：两点之间距离最短。', 6: '最短航线就是大圆弧长。', 26: '1:10万地图：2公里=2厘米。', 29: '起落航线一转弯、四转弯高度一般不低于100米。' },
    types: { 1: 'formula', 2: 'formula', 5: 'relationship', 6: 'relationship', 26: 'formula', 29: 'threshold' }
  },
  4: {
    tips: { 9: '飞行组织四阶段：预先准备→直接准备→飞行实施→飞行讲评。', 22: '电子围栏记两件事：阻挡侵入 + 报警。', 24: '失控预案按对象分：回收、云端上报、未接入云则联系空管上报。', 38: '监视系统获取运行信息：两种方式都包括。' },
    types: { 9: 'sequence', 22: 'spec-list', 24: 'sequence', 38: 'spec-list' },
    specs: { 22: [['阻挡侵入', ''], ['报警功能', '']], 38: [['被动反馈', '雷达/ADS-B'], ['主动反馈', '运营人发送']] }
  },
  5: {
    tips: { 3: '供电系统负责给各用电系统和设备提供电能。', 4: '地面站四功能：指挥调度、任务规划、操作控制、显示记录。', 10: '控制站由飞行操纵、任务载荷、数据链路、通信指挥组成。', 19: '导航输出三项：高度、速度、位置。', 22: '电动动力系统：电机 + 动力电源 + 调速系统。', 27: '飞控核心三项：姿态稳定控制、飞行管理、应急控制。', 49: '电气系统三部分：电源、配电系统、用电设备。', 50: '无人机系统三要素：飞行器平台、控制站、通信链路。' },
    types: { 3: 'relationship', 4: 'composition', 10: 'composition', 19: 'composition', 22: 'composition', 27: 'composition', 49: 'composition', 50: 'composition' }
  },
  6: {
    tips: { 1: '载荷规划管设备：传感器、摄像机、任务设备和工作模式。', 2: '通信规划管通信任务和与任务控制站的通信方式。', 3: '航线规划记位置、航高、速度和到达时间段。', 7: '实时规划=根据变化修改预案，快速生成安全航迹。', 12: '电子地图显示位置、航迹、规划点和规划航迹。', 30: '任务规划六环节：理解→评估→分配→规划→优化→评价。', 50: '应急航线三件套：安全返航通道、应急迫降点、航线转移策略。' },
    types: { 1: 'composition', 2: 'relationship', 3: 'composition', 7: 'sequence', 12: 'relationship', 30: 'sequence', 50: 'composition' }
  },
  7: {
    tips: { 3: '6S=22.2V；最大电流=容量12Ah×3C=36A。', 4: 'KV×电压：1000×11.1=11100转/分。', 19: '三根电机线任意调两根，电机反转。', 35: '信号顺序：接收机→飞控→电调→电机。', 49: '电调额定电流应高于持续工作电流，10A可选50A。', 53: '电调30A指能承受的最大瞬间电流为30A。', 54: 'BEC 5V：从红黑线输出5V。', 55: 'KV值=每1V电压对应的理论转速。' },
    types: { 3: 'formula', 4: 'formula', 19: 'relationship', 35: 'sequence', 49: 'threshold', 53: 'threshold', 54: 'relationship', 55: 'formula' }
  },
  8: {
    tips: { 4: '地面风速大于4级，会影响安全和拍摄稳定。', 16: '雷暴成熟后冷空气下沉，阵风常达20m/s。', 18: '风向袋吹平：风速约6–10m/s。', 33: '空气达到饱和时：气温=露点温度。', 34: '华氏转摄氏：59°F=15°C。', 54: '雷暴三阶段：积云→成熟→消散。', 58: '大气组成约78%氮、21%氧、1%其他。', 85: '4级风：5.5–7.9m/s。' },
    types: { 4: 'threshold', 16: 'threshold', 18: 'range-distance', 33: 'relationship', 34: 'formula', 54: 'sequence', 58: 'spec-list', 85: 'range-distance' },
    specs: { 58: [['氮气', '78%'], ['氧气', '21%'], ['其他', '1%']] }
  },
  9: {
    tips: { 1: '风速增大：偏流增大；顺侧风地速增大。', 2: '风速减小：偏流减小；逆侧风地速增大。', 3: '真空速增大：地速增大、偏流减小。', 35: '垂直向上突风使升力增大。', 66: '气体粘性随温度升高而增大。', 72: '升力系数越大，产生的升力越大。', 158: '理想气体关系：P=RρT。', 225: '平飞平衡：升力=重力、推力=阻力、力矩平衡。' },
    types: { 1: 'relationship', 2: 'relationship', 3: 'relationship', 35: 'relationship', 66: 'relationship', 72: 'relationship', 158: 'formula', 225: 'spec-list' },
    specs: { 225: [['升力', '=重力'], ['推力', '=阻力'], ['力矩', '平衡']] }
  },
  10: {
    tips: { 3: '事故60%以上发生在起降阶段。', 4: '五边航线不含任务飞行。', 24: '起降驾驶员不参与巡航阶段控制。', 45: '平飘前段速度较大、下沉较慢，拉杆量小。', 53: '风速大或气温低，目测低时要相应多加油门。', 82: '长时间爬升发动机温度高：先定高，指标正常再继续。', 84: '坡度转弯配合方向舵，可减小转弯半径和侧滑。' },
    types: { 3: 'threshold', 4: 'composition', 24: 'sequence', 45: 'relationship', 53: 'relationship', 82: 'sequence', 84: 'relationship' }
  }
};

for (const fileName of chapterFiles) {
  const chapterMatch = fileName.match(/第(\d{2})章/);
  const chapter = Number(chapterMatch[1]);
  const markdown = fs.readFileSync(path.join(sourceDir, fileName), 'utf8');
  const blocks = markdown.split(/(?=^## 第\d+题\s*$)/m).slice(1);

  blocks.forEach((block, position) => {
    const numberMatch = block.match(/^## 第(\d+)题\s*$/m);
    const number = numberMatch ? Number(numberMatch[1]) : position + 1;
    const type = field(block, '题型');
    const question = field(block, '题干');
    const options = parseOptions(block);
    const answer = field(block, '正确答案');
    const answerIndex = answer ? answer.charCodeAt(0) - 65 : -1;
    const id = `ch${String(chapter).padStart(2, '0')}-q${String(number).padStart(3, '0')}`;

    if (!question || options.length < 2 || answerIndex < 0 || answerIndex >= options.length) {
      errors.push({ fileName, number, id, type, question, optionCount: options.length, answer });
    }

    questions.push({
      id,
      chapter,
      number,
      type,
      question,
      options: options.map(({ text }) => text),
      answer: answerIndex,
      tip: chapter === 1 ? chapterOneTips[number - 1] || '' : chapter === 2 ? chapterTwoTips[number] || '' : chapterMemoryData[chapter]?.tips[number] || '',
      memoryType: chapter === 1 ? chapterOneMemoryTypes[number] || null : chapter === 2 ? chapterTwoMemoryTypes[number] || null : chapterMemoryData[chapter]?.types[number] || null,
      specItems: chapter === 1 ? chapterOneSpecItems[number] || null : chapter === 2 ? chapterTwoSpecItems[number] || null : chapterMemoryData[chapter]?.specs?.[number] || null,
      reviewStatus: questionReviewData[id]?.status || 'unreviewed',
      reviewNote: questionReviewData[id]?.note || '',
      source: fileName,
      sourceAnswer: answer
    });
  });
}

const output = {
  version: 1,
  title: 'CAAC 无人机认证题库',
  target: '超视距多旋翼',
  sourceFormat: 'chapter-markdown',
  chapters: chapterFiles.map((fileName) => {
    const chapter = Number(fileName.match(/第(\d{2})章/)[1]);
    return { chapter, file: fileName, questionCount: questions.filter((item) => item.chapter === chapter).length };
  }),
  questionCount: questions.length,
  questions,
  parseErrors: errors
};

fs.writeFileSync(path.join(root, '题库_统一.json'), JSON.stringify(output, null, 2) + '\n');
const browserQuestions = output.questions;
fs.writeFileSync(
  path.join(root, 'CAAC闪卡', 'questions.js'),
  `window.CAAC_QUESTIONS = ${JSON.stringify(browserQuestions, null, 2)};\n`
);
console.log(JSON.stringify({ chapters: output.chapters, questionCount: output.questionCount, parseErrorCount: errors.length }, null, 2));
if (errors.length) process.exitCode = 1;
