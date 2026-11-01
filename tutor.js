// Original Room 001 teaching scripts, retained as an explicitly offline demo.
export const topics={
  free:{name:'自由提问',title:'Stay curious.',sub:'Every question is a beginning.',prompt:'今天想弄明白什么？'},
  chem:{name:'化学',title:'HCl + NaOH',sub:'→ NaCl + H₂O',prompt:'酸和碱相遇，为什么会发生中和？'},
  english:{name:'英语',title:'Let’s talk.',sub:'Practice makes progress.',prompt:'How can I introduce myself in English?'},
  math:{name:'数学',title:'x² − 5x + 6 = 0',sub:'Can you find x?',prompt:'方程 x²−5x+6=0 怎么解？'}
};
export function respond(question,topic="free") {
    const q=question.toLowerCase();
    if(/谢谢|thank|太棒/.test(q))return '不客气！学到一个新东西时，也可以试着把它教给别人。🐾';
    if(/中和|酸|碱|化学|hcl|naoh|反应/.test(q)||topic==='chem')return '我们从中和反应开始：\nHCl + NaOH → NaCl + H₂O\n盐酸提供 H⁺，氢氧化钠提供 OH⁻，两者结合成水。\n想一想：如果酸过量，反应后的溶液更可能呈酸性还是碱性？';
    if(/english|introduce|英语|口语|hello|speak/.test(q)||topic==='english')return 'Let’s start simply!\n“Hi, I’m Alex. I love learning new things.”\n你可以把 Alex 换成自己的名字。\nYour turn: What do you like to do in your free time?';
    if(/数学|方程|x²|x2|因式|二次|求解/.test(q)||topic==='math')return '试试因式分解：\nx² − 5x + 6 = (x − 2)(x − 3)\n让两个因式中的任意一个为 0，就得到 x = 2 或 x = 3。\n你能用代入法验证答案吗？';
    if(/你是谁|什么平台|boundless|愿景|理想/.test(q))return '我是 Boundless Classroom 的第一位猫老师（目前还是演示原型）。我们相信 Love, Share and Peace：尊重、自愿分享，以及通过学习认识不同的人。';
    return '这个问题很有意思。🐾\n先问自己两个小问题：我已经知道什么？最想弄清哪一部分？\n目前我只是离线教学脚本，还不能真正理解所有自由提问。未来接入大模型后，我们就能一起深入探索。你也可以点选化学、英语或数学看看示范。';
}
