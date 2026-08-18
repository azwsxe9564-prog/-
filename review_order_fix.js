/* Review answer order fix: show correct answer before user's answer. */
/* Deployment trigger after inline review renderer fix. */
(function(){
  function fixReviewOrder(){
    const root=document.getElementById('review');
    if(!root)return;
    const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
    const nodes=[];
    while(walker.nextNode())nodes.push(walker.currentNode);
    nodes.forEach(node=>{
      const text=node.nodeValue||'';
      if(!text.includes('你的答案：')||!text.includes('正確答案：'))return;
      const m=text.match(/你的答案：\s*([^｜|\s]+)\s*[｜|]\s*正確答案：\s*([^\s<]+)/);
      if(!m)return;
      node.nodeValue=text.replace(m[0],`正確答案：${m[2]}｜你的答案：${m[1]}`);
    });
  }
  setTimeout(fixReviewOrder,100);
  const observer=new MutationObserver(()=>fixReviewOrder());
  setTimeout(()=>{const root=document.getElementById('review');if(root)observer.observe(root,{childList:true,subtree:true});},200);
  window.addEventListener('load',fixReviewOrder);
})();
