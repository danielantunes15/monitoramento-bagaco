// monitoramento-bagaco/server/utils/supabaseClient.js
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://dwtpndtdwiqnehoskcwy.supabase.co';
const supabaseKey = 'sb_publishable_DsF6RMYmxYBFJhK_rpdHNg_Wcixc9Qn'; 

const supabase = createClient(supabaseUrl, supabaseKey);

module.exports = supabase;