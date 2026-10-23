const {currentProfile,supabase,send}=require('./_supabase');
module.exports=async(req,res)=>{
 res.setHeader('Cache-Control','private, no-store');
 if(req.method!=='GET')return send(res,405,{error:'METHOD_NOT_ALLOWED'});
 try{const {profile}=await currentProfile(req);if(profile.role!=='developer')return send(res,403,{error:'FORBIDDEN'});
 const data=await supabase('/rest/v1/profiles?select=employee_no,display_name,email_prefix,department,role&order=employee_no.asc');return send(res,200,{data});
 }catch(error){return send(res,error.message==='UNAUTHORIZED'?401:403,{error:'FORBIDDEN'});}
};

