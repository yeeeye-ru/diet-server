// 从项目根目录导入supabase配置（注意路径：../supabase.js）
const supabase = require("../supabase.js");

module.exports = async (req, res) => {
  // 跨域配置
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  // 处理OPTIONS预检请求
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  // 发帖（POST）
  if (req.method === "POST") {
    const { content, author } = req.body;
    if (!content || !author) {
      return res.status(400).json({ error: "内容和作者不能为空" });
    }
    const { data, error } = await supabase
      .from("posts")
      .insert([{ content, author }]);
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ success: true, data });
  }

  // 获取帖子（GET）
  if (req.method === "GET") {
    const { data, error } = await supabase
      .from("posts")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    return res.json(data);
  }

  res.status(405).json({ error: "仅支持GET/POST/OPTIONS请求" });
};
