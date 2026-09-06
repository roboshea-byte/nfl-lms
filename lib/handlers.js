const db=require('../api/_db');
const auth=require('./accounts').createAccounts({db});
module.exports={...require('./api').createHandlers({db,auth}),account:auth.handler};
