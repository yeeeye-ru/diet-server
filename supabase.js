const { createClient } = require('@supabase/supabase-js');

// 替换为你的Supabase信息
const supabaseUrl = 'https://ppkkgta1yioemdytog.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBwa2tndGFpeWlveWVtZHlvdG9nIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU4MDk5MTAsImV4cCI6MjA4MTM4NTkxMH0.G_QPD2TMkKp5bBxcC87RYt75CzHo8GOdNbqzTjw8DoQ';
const supabase = createClient(supabaseUrl, supabaseKey);

module.exports = supabase;