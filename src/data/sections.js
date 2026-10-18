export const sections = [
  {
    id: "meeting",
    number: "01",
    chapter: "Next Hello",
    title: "下一次见面计划",
    subtitle: "把「想见你」，变成确定的日期。",
    footer: "Our next hello",
    footerMark: "♥",
    emptyTitle: "下一次见面，还空着",
    emptyText: "从一条待办开始，或写下一整页想见你的心情。",
  },
  {
    id: "travel",
    number: "02",
    chapter: "Places To Go",
    title: "收藏的旅游计划",
    subtitle: "把想去的地方，都收进未来。",
    footer: "Places to go, together",
    footerMark: "✦",
    emptyTitle: "旅行收藏夹还是空的",
    emptyText: "把第一座想一起去的城市，写进这里吧。",
  },
  {
    id: "wish",
    number: "03",
    chapter: "Eat · Play · Love",
    title: "想吃想玩的计划",
    subtitle: "把普通日常，过成小小冒险。",
    footer: "Eat · Play · Love",
    footerMark: "♡",
    emptyTitle: "愿望清单等你落笔",
    emptyText: "想吃的、想玩的、想和你一起做的，都可以放进来。",
  },
];

export const sectionById = Object.fromEntries(sections.map((section) => [section.id, section]));
