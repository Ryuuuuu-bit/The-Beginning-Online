export type Decoration={kind:string;x:number;z:number;w:number;d:number;variant?:number;label?:string;solid?:boolean};
// The six quarters share geometry with server collision and both city viewers.
export const NEW_BUILDINGS:Decoration[]=[
  {kind:'guild',x:-13,z:-28,w:11,d:9,label:'สมาคมนักผจญภัยแสงอรุณ',solid:true},
  {kind:'chapel',x:13,z:-33,w:9,d:10,label:'วิหารแสงอรุณ',solid:true},
  {kind:'workshop',x:-36,z:-19,w:8,d:7,label:'โรงงานไม้และเครื่องหนัง',solid:true},
  {kind:'inn',x:17,z:30,w:10,d:8,label:'โรงเตี๊ยมเตาผิงอุ่น',solid:true},
  {kind:'gazebo',x:-31,z:30,w:5,d:5,label:'ศาลาธาราจันทร์',solid:true},
];
export const DECOR:Decoration[]=[
  ...NEW_BUILDINGS,
  ...[[24,7],[31,8],[24,20],[32,21],[37,8],[38,21]].map(([x,z],i)=>({kind:'stall',x,z,w:3,d:2.4,variant:i,solid:true})),
  ...[[-7,-7],[7,-7],[-7,7],[7,7],[-8,-20],[7,-22],[-20,-20],[-18,7],[18,7],[9,24],[25,27],[-9,27],[-35,24],[7,40],[-7,40],[-40,7],[40,-7],[7,-40]].map(([x,z],i)=>({kind:'lamp',x,z,w:.45,d:.45,variant:i,solid:true})),
  ...[[-7,-17],[-19,-22],[7,-25],[19,-25],[-7,33],[7,33]].map(([x,z],i)=>({kind:'banner',x,z,w:.5,d:.5,variant:i,solid:true})),
  ...[[-31,20],[-22,31],[-14,27],[-16,-36],[24,-34],[31,-27],[9,35]].map(([x,z],i)=>({kind:'flowerbed',x,z,w:3,d:1.4,variant:i,solid:true})),
  ...[[12,23],[19,23],[25,30]].map(([x,z],i)=>({kind:'table',x,z,w:1.8,d:1.8,variant:i,solid:true})),
  ...[[-29,8],[-25,11],[-33,11],[-29,15]].map(([x,z],i)=>({kind:'dummy',x,z,w:.7,d:.7,variant:i,solid:true})),
  {kind:'notice',x:-6,z:14,w:2,d:.7,label:'กระดานข่าวนักผจญภัย',solid:true},
  {kind:'notice',x:-19,z:-19,w:2,d:.7,label:'ประกาศสมาคม',solid:true},
  {kind:'wagon',x:13,z:39,w:3.2,d:2,label:'จุดพักคาราวาน',solid:true},
  {kind:'wagon',x:38,z:29,w:3.2,d:2,variant:1,solid:true},
  {kind:'anvil',x:-20,z:-8,w:1.5,d:1,solid:true},
  ...[[-30,-10],[-38,-13],[38,25],[29,18],[21,35]].map(([x,z],i)=>({kind:'barrels',x,z,w:1.4,d:1.4,variant:i,solid:true})),
  ...[[-29,24],[-20,29],[-16,20],[29,-29]].map(([x,z])=>({kind:'bench',x,z,w:2.2,d:.7,solid:true})),
];
export const CITY2D_FOUNTAIN={x:-23,z:23,r:2.5};
export const CITY2D_HEALER={x:-16,z:16};
export const GARDEN_TREES=[[-36,23],[-35,35],[-26,36],[-14,33],[-9,23],[-31,16],[-19,36],[-39,-29],[-30,-35],[-23,-37],[8,-41],[22,-38],[30,-31],[37,-24],[24,-23],[29,-16],[38,-35],[32,34],[26,38],[8,37],[-38,15],[-40,38]].map(([x,z],i)=>({x,z,flowering:i%3!==0}));
export const FORTIFICATION_SOLIDS=[
  ...[[-47,-47],[47,-47],[-47,47],[47,47]].map(([x,z])=>({x,z,w:3.4,d:3.4})),
];
