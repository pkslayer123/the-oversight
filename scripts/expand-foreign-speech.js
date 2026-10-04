// Expand thin foreignSpeech pools (laugh/need_* had only 2 entries) to 4+.
// Usage: node scripts/expand-foreign-speech.js
const fs = require('fs');
const path = require('path');
const P = path.join(__dirname, '..', 'src', 'data', 'foreignSpeech.json');
const d = JSON.parse(fs.readFileSync(P, 'utf8'));

const ADD = {
italian: {
  laugh: [
    { t: "Ahah, che ridere!", en: "Haha, that's funny!", kw: { "ridere": "to laugh" } },
    { t: "Non ci posso credere!", en: "I can't believe it!", kw: { "credere": "to believe" } },
  ],
  need_food: [
    { t: "Ho una fame da lupi.", en: "I'm starving. (Lit: a wolves' hunger.)", kw: { "fame": "hunger", "lupi": "wolves" } },
    { t: "Qualcosa da mangiare, ti prego.", en: "Something to eat, I beg you.", kw: { "mangiare": "to eat", "ti prego": "I beg you" } },
  ],
  need_water: [
    { t: "Ho la gola secca.", en: "My throat is dry.", kw: { "gola": "throat", "secca": "dry" } },
    { t: "Un po' d'acqua, per favore.", en: "A little water, please.", kw: { "acqua": "water", "per favore": "please" } },
  ],
  need_danger: [
    { t: "Stai attento!", en: "Be careful!", kw: { "attento": "careful" } },
    { t: "C'è qualcosa lì fuori.", en: "There's something out there.", kw: { "qualcosa": "something" } },
  ],
  need_help: [
    { t: "Aiutami, ti prego.", en: "Help me, I beg you.", kw: { "aiutami": "help me" } },
    { t: "Non ce la faccio da solo.", en: "I can't do it alone.", kw: { "da solo": "alone" } },
  ],
},
spanish: {
  laugh: [
    { t: "¡Qué risa!", en: "How funny!", kw: { "risa": "laughter" } },
    { t: "¡No me lo puedo creer!", en: "I can't believe it!", kw: { "creer": "to believe" } },
  ],
  need_food: [
    { t: "Tengo un hambre que me muero.", en: "I'm dying of hunger.", kw: { "hambre": "hunger", "muero": "I die" } },
    { t: "Algo de comer, por favor.", en: "Something to eat, please.", kw: { "comer": "to eat", "por favor": "please" } },
  ],
  need_water: [
    { t: "Tengo la garganta seca.", en: "My throat is dry.", kw: { "garganta": "throat", "seca": "dry" } },
    { t: "Un poco de agua, por favor.", en: "A little water, please.", kw: { "agua": "water" } },
  ],
  need_danger: [
    { t: "¡Ten cuidado!", en: "Be careful!", kw: { "cuidado": "care" } },
    { t: "Hay algo ahí fuera.", en: "There's something out there.", kw: { "algo": "something", "fuera": "outside" } },
  ],
  need_help: [
    { t: "Ayúdame, por favor.", en: "Help me, please.", kw: { "ayúdame": "help me" } },
    { t: "No puedo solo.", en: "I can't alone.", kw: { "solo": "alone" } },
  ],
},
french: {
  laugh: [
    { t: "C'est trop drôle !", en: "That's so funny!", kw: { "drôle": "funny" } },
    { t: "Je n'y crois pas !", en: "I don't believe it!", kw: { "crois": "believe" } },
  ],
  need_food: [
    { t: "J'ai une faim de loup.", en: "I'm wolf-hungry.", kw: { "faim": "hunger", "loup": "wolf" } },
    { t: "Quelque chose à manger, s'il te plaît.", en: "Something to eat, please.", kw: { "manger": "to eat" } },
  ],
  need_water: [
    { t: "J'ai la gorge sèche.", en: "My throat is dry.", kw: { "gorge": "throat", "sèche": "dry" } },
    { t: "Un peu d'eau, s'il te plaît.", en: "A little water, please.", kw: { "eau": "water" } },
  ],
  need_danger: [
    { t: "Fais attention !", en: "Be careful!", kw: { "attention": "care" } },
    { t: "Il y a quelque chose là-dehors.", en: "There's something out there.", kw: { "quelque chose": "something" } },
  ],
  need_help: [
    { t: "Aide-moi, s'il te plaît.", en: "Help me, please.", kw: { "aide-moi": "help me" } },
    { t: "Je n'y arrive pas seul.", en: "I can't manage alone.", kw: { "seul": "alone" } },
  ],
},
mandarin: {
  laugh: [
    { t: "太好笑了！", en: "Too funny!", kw: { "好笑": "funny" } },
    { t: "我不敢相信！", en: "I can't believe it!", kw: { "不敢相信": "can't believe" } },
  ],
  need_food: [
    { t: "我快饿死了。", en: "I'm starving to death.", kw: { "饿": "hungry", "死": "death" } },
    { t: "给我点吃的，求你了。", en: "Give me something to eat, please.", kw: { "吃的": "food to eat", "求你": "beg you" } },
  ],
  need_water: [
    { t: "我嗓子都干了。", en: "My throat is all dry.", kw: { "嗓子": "throat", "干": "dry" } },
    { t: "给我点水喝吧。", en: "Give me some water to drink.", kw: { "水": "water", "喝": "to drink" } },
  ],
  need_danger: [
    { t: "小心！", en: "Careful!", kw: { "小心": "careful" } },
    { t: "外面有东西。", en: "There's something outside.", kw: { "外面": "outside", "东西": "thing" } },
  ],
  need_help: [
    { t: "帮帮我，求你了。", en: "Help me, I beg you.", kw: { "帮": "to help" } },
    { t: "我一个人不行。", en: "I can't alone.", kw: { "一个人": "alone", "不行": "not OK" } },
  ],
},
hindi: {
  laugh: [
    { t: "बहुत हँसी आई!", en: "So funny!", kw: { "हँसी": "laughter" } },
    { t: "मुझे यकीन नहीं हो रहा!", en: "I can't believe it!", kw: { "यकीन": "belief" } },
  ],
  need_food: [
    { t: "मुझे बहुत भूख लगी है।", en: "I'm very hungry.", kw: { "भूख": "hunger" } },
    { t: "कुछ खाने को दो, प्लीज़।", en: "Give something to eat, please.", kw: { "खाने": "to eat" } },
  ],
  need_water: [
    { t: "मेरा गला सूख गया है।", en: "My throat has dried.", kw: { "गला": "throat", "सूख": "dry" } },
    { t: "थोड़ा पानी दो।", en: "Give a little water.", kw: { "पानी": "water" } },
  ],
  need_danger: [
    { t: "सावधान रहो!", en: "Stay careful!", kw: { "सावधान": "careful" } },
    { t: "बाहर कुछ है।", en: "There's something outside.", kw: { "बाहर": "outside", "कुछ": "something" } },
  ],
  need_help: [
    { t: "मेरी मदद करो, प्लीज़।", en: "Help me, please.", kw: { "मदद": "help" } },
    { t: "मैं अकेला नहीं कर सकता।", en: "I can't do it alone.", kw: { "अकेला": "alone" } },
  ],
},
arabic: {
  laugh: [
    { t: "يا له من مضحك!", en: "How funny!", kw: { "مضحك": "funny" } },
    { t: "لا أصدق!", en: "I don't believe it!", kw: { "أصدق": "believe" } },
  ],
  need_food: [
    { t: "أنا جائع جداً.", en: "I'm very hungry.", kw: { "جائع": "hungry" } },
    { t: "شيء للأكل، من فضلك.", en: "Something to eat, please.", kw: { "الأكل": "the food", "من فضلك": "please" } },
  ],
  need_water: [
    { t: "حلقي جاف.", en: "My throat is dry.", kw: { "حلقي": "my throat", "جاف": "dry" } },
    { t: "بعض الماء، من فضلك.", en: "Some water, please.", kw: { "الماء": "the water" } },
  ],
  need_danger: [
    { t: "احذر!", en: "Beware!", kw: { "احذر": "beware" } },
    { t: "هناك شيء في الخارج.", en: "There's something outside.", kw: { "شيء": "something", "الخارج": "the outside" } },
  ],
  need_help: [
    { t: "ساعدني، من فضلك.", en: "Help me, please.", kw: { "ساعدني": "help me" } },
    { t: "لا أستطيع وحدي.", en: "I can't alone.", kw: { "وحدي": "alone" } },
  ],
},
portuguese: {
  laugh: [
    { t: "Que engraçado!", en: "How funny!", kw: { "engraçado": "funny" } },
    { t: "Não acredito!", en: "I don't believe it!", kw: { "acredito": "believe" } },
  ],
  need_food: [
    { t: "Estou morrendo de fome.", en: "I'm dying of hunger.", kw: { "fome": "hunger", "morrendo": "dying" } },
    { t: "Algo para comer, por favor.", en: "Something to eat, please.", kw: { "comer": "to eat", "por favor": "please" } },
  ],
  need_water: [
    { t: "Estou com a garganta seca.", en: "My throat is dry.", kw: { "garganta": "throat", "seca": "dry" } },
    { t: "Um pouco de água, por favor.", en: "A little water, please.", kw: { "água": "water" } },
  ],
  need_danger: [
    { t: "Cuidado!", en: "Careful!", kw: { "cuidado": "care" } },
    { t: "Tem algo lá fora.", en: "There's something out there.", kw: { "algo": "something", "fora": "outside" } },
  ],
  need_help: [
    { t: "Me ajuda, por favor.", en: "Help me, please.", kw: { "ajuda": "help" } },
    { t: "Não consigo sozinho.", en: "I can't alone.", kw: { "sozinho": "alone" } },
  ],
},
russian: {
  laugh: [
    { t: "Как смешно!", en: "How funny!", kw: { "смешно": "funny" } },
    { t: "Не могу поверить!", en: "I can't believe it!", kw: { "поверить": "to believe" } },
  ],
  need_food: [
    { t: "Я умираю с голоду.", en: "I'm dying of hunger.", kw: { "голоду": "hunger", "умираю": "I die" } },
    { t: "Дай что-нибудь поесть, пожалуйста.", en: "Give something to eat, please.", kw: { "поесть": "to eat", "пожалуйста": "please" } },
  ],
  need_water: [
    { t: "У меня горло пересохло.", en: "My throat dried out.", kw: { "горло": "throat", "пересохло": "dried out" } },
    { t: "Немного воды, пожалуйста.", en: "A little water, please.", kw: { "воды": "water" } },
  ],
  need_danger: [
    { t: "Осторожно!", en: "Careful!", kw: { "осторожно": "careful" } },
    { t: "Там что-то есть.", en: "There's something there.", kw: { "что-то": "something" } },
  ],
  need_help: [
    { t: "Помоги мне, пожалуйста.", en: "Help me, please.", kw: { "помоги": "help" } },
    { t: "Я один не справлюсь.", en: "I can't manage alone.", kw: { "один": "alone" } },
  ],
},
};

let added = 0;
for (const [lang, kinds] of Object.entries(ADD)) {
  for (const [kind, phrases] of Object.entries(kinds)) {
    const pool = d[lang][kind];
    for (const p of phrases) {
      if (!pool.some(e => e.t === p.t)) { pool.push(p); added++; }
    }
  }
}
fs.writeFileSync(P, JSON.stringify(d, null, 1), 'utf8');
console.log(`added ${added} phrases`);
