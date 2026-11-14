(function(){
 "use strict";
 function init(){
  const dialog=document.getElementById("bepAdviceDialog");
  const robot=document.getElementById("bepAdviceRobot");
  if(!dialog||!robot||robot.dataset.adviceBound==="1")return;
  robot.dataset.adviceBound="1";
  const ids={home:"aiHome",budget:{income:"aiIncome",charges:"aiCharges",monthly:"aiMonthly"},savings:"aiSavings",purchases:"aiPurchases"};
  const labels={home:"Accueil",income:"Budget · Mes revenus",charges:"Budget · Mes charges",monthly:"Budget · Budgets mensuels",savings:"Épargne",purchases:"Dépenses"};
  function context(){const panel=document.querySelector(".panel.active")?.id||"home";return panel==="budget"?(document.querySelector("[data-budget-module].active")?.dataset.budgetModule||"income"):panel}
  function open(){const key=context(),targetId=typeof ids[key]==="string"?ids[key]:ids.budget[key]||ids.budget.income;dialog.querySelectorAll(".bep-advice-content .ai-advice,.bep-advice-content .savings-advisor-foot").forEach(el=>{el.hidden=el.id!==targetId&&!(key==="savings"&&el.id==="savingsAdvisorFoot")});const label=document.getElementById("bepAdviceContext");if(label)label.textContent=labels[key]||"Votre situation";if(!dialog.open)dialog.showModal();robot.setAttribute("aria-expanded","true");if(typeof window.recordAdvice==="function")window.recordAdvice(key)}
  function close(){if(dialog.open)dialog.close();robot.setAttribute("aria-expanded","false")}
  robot.addEventListener("click",()=>dialog.open?close():open());
  document.getElementById("bepAdviceClose")?.addEventListener("click",close);
  document.getElementById("bepAdviceMinimize")?.addEventListener("click",close);
  dialog.addEventListener("click",event=>{if(event.target===dialog)close()});
  window.BEP_OPEN_ADVICE=open;
 }
 if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init,{once:true});else init();
 window.addEventListener("bep:app-ready",init);
})();
