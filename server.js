const jsonServer = require('json-server');
const server = jsonServer.create();
// 关键：向上一层找db.json（因为server.js在api子文件夹）
const router = jsonServer.router('../db.json');
const middlewares = jsonServer.defaults();

server.use(middlewares);
server.use(router);

// Vercel Serverless函数必须导出这个处理函数
module.exports = (req, res) => {
  server(req, res);
};
