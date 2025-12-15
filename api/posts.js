const supabase = require("../supabase");

module.exports = async (req, res) => {
  // 跨域配置
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST");

  // 发帖（POST）
  if (req.method === "POST") {
    const { content, author } = req.body;
    const { data, error } = await supabase
      .from('posts')
      .insert([{ content, author }]);
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ success: true, data });
  }

  // 获取帖子（GET）
  if (req.method === "GET") {
    const { data, error } = await supabase
      .from('posts')
      .select('*')
      .order('time', { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    return res.json(data);
  }

  res.status(405).json({ error: "Method not allowed" });
};