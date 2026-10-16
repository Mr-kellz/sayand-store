(() => {
 'use strict';
 const config=window.SAYAND_SERVICE_CONFIG || {};
 if(config.appCheckSiteKey && firebase.appCheck)firebase.appCheck().activate(new firebase.appCheck.ReCaptchaEnterpriseProvider(config.appCheckSiteKey),true);
 window.SayandServices={async call(name,data={}) {
  if(!config.appCheckSiteKey)throw Error('This service is being configured. Please contact support@thesayand.com.');
  return (await firebase.functions().httpsCallable(name)(data)).data;
 }};
 if(config.appCheckSiteKey && !/\/login(?:\.html)?$/.test(location.pathname))firebase.auth().onAuthStateChanged(async user=>{
  if(!user)return;
  try {const p=(await firebase.database().ref('users/'+user.uid).once('value')).val();if(!p || ['firstName','lastName','email','createdAt','accountVerified','welcomeEmailSent','referralCode'].some(k=>p[k]===undefined))await window.SayandServices.call('ensureCustomerProfile');}catch(e){console.error('Profile setup unavailable',e.code || e.message);}
 });
})();
