(()=>{"use strict";
function rebuild(){
 const panel=document.getElementById("purchases");
 if(!panel||panel.dataset.cleanSpendReady==="1")return;
 const hero=panel.querySelector("#bepSpendExperience");
 const add=panel.querySelector("#bepAddPurchase");
 const history=panel.querySelector(".bep-spend-history-details")?.closest("article.card");
 if(!hero||!add||!history)return;
 const dialogs=[...panel.querySelectorAll("dialog")];
 dialogs.forEach(dialog=>document.body.appendChild(dialog));
 panel.replaceChildren();
 panel.className="panel active bep-spend-clean";
 panel.dataset.cleanSpendReady="1";
 const intro=document.createElement("div");
 intro.className="bep-spend-clean-intro";
 intro.textContent="Chaque achat est enregistré et retrouvé dans ton historique.";
 const actions=document.createElement("section");
 actions.className="bep-spend-clean-actions";
 add.setAttribute("aria-label","Ajouter un achat");
 actions.appendChild(add);
 const historySection=document.createElement("section");
 historySection.className="bep-spend-clean-history";
 history.setAttribute("aria-label","Historique des achats");
 const details=history.querySelector("details");
 if(details){details.open=false;details.classList.add("bep-spend-clean-details");}
 historySection.appendChild(history);
 panel.append(hero,intro,actions,historySection);
 panel.querySelectorAll(".bep-spend-view,.bep-spend-nav,.bep-spend-score").forEach(el=>el.remove());
 const trigger=()=>window.BEP_OPEN_PURCHASE_DIALOG?.();
 add.addEventListener("click",trigger);
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",rebuild,{once:true});else rebuild();
window.addEventListener("bep:app-ready",rebuild,{once:true});
})();