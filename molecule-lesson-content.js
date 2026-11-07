// Curated teaching script, not a generated AI response. Geometry lives in molecule-lesson.js.
// Scientific reference: OpenStax Chemistry 2e §§7.2 and 7.6.
export const moleculeSteps = [
  {
    title:'先看形状',
    board:{title:'相同的三原子，不同的形状',points:['H₂O：折线形，键角约 104.5°','CO₂：直线形，键角 180°','拖动分子，从另一个角度看看。']},
    text:'喵，先把两个小分子放到面前。水分子是折线形，键角约一百零四点五度；二氧化碳是一条直线，键角一百八十度。\n你可以拖动它们，换个角度看看。它们都有三颗原子，但空间排列并不一样。猜猜看，这会怎样影响分子的极性？'
  },
  {
    title:'看每一根键',
    board:{title:'键有极性，还要看方向',points:['O–H、C=O：氧都更吸引成键电子','带十字尾的箭头：由正端指向负端','两种分子都含极性键。']},
    text:'现在看这些细箭头。氧比氢、碳更吸引成键电子，所以两种分子里的键都有极性。\n这里用化学中的极性箭头：带十字的尾端表示偏正的一端，箭头朝向偏负的氧。注意，电子仍然在共享，并不是整颗电子搬了家。我们先看方向，下一步再把它们合起来。'
  },
  {
    title:'把方向合起来',
    board:{title:'一个抵消，一个留下合力',points:['CO₂：两边等大、反向 → 净偶极为零','H₂O：两个方向不相反 → 无法抵消','水的合成方向沿夹角平分线朝向氧。']},
    text:'看二氧化碳：两根相同的碳氧键，极性方向正好相反，合起来就抵消了。\n再看水分子，两根氧氢键是弯着排列的。两侧的分量相互抵消，但朝向氧这一侧的分量叠加，留下了金色的合成箭头。喵，关键就是把方向也算进去。箭头长短只是示意，不代表测得的偶极矩数值。'
  },
  {
    title:'留下一个判断方法',
    board:{title:'先看键，再看空间排列',points:['CO₂：含极性键，但分子非极性','H₂O：键偶极不抵消，分子有极性','有极性键 ≠ 一定是极性分子']},
    text:'我们抓住重点啦：判断分子极性，先看键是否有极性，再看它们在空间中能不能抵消。\n二氧化碳含有极性键，但整个分子是非极性的；水分子的键偶极不能抵消，所以它是极性分子。\n轮到你了：如果只知道一个分子“含有氧”，能直接判断它有极性吗？你可以在下面告诉我你的想法。'
  }
];

// Explicit bounded lesson context travels through the existing chat contract.
// It does not claim the model can see the canvas or operate the molecule objects.
export function moleculeQuestion(question,step){
  if(!Number.isInteger(step)||!moleculeSteps[step])return question;
  return `课堂背景：学生正在参加 H₂O / CO₂ 三维对比课，第 ${step+1} 步“${moleculeSteps[step].title}”。已展示的重点：${moleculeSteps[step].board.points.join('；')}。形状、键角和箭头是教学示意，箭头采用十字正端朝负端的化学约定，不是量子计算或测得的偶极矩。你不能看到或操作实时画面。请根据当前教学内容自然回答学生，尊重学生转到其他话题的选择。\n学生的问题：${question}`;
}
