import { buildRolePromptBlock } from '../src/lib/portal/role-prompt-block';

const chatBlock = buildRolePromptBlock({ meerkatRoleId: 'nami', variant: 'chat' });
console.log(`Chat variant length: ${chatBlock.length} chars = ~${Math.round(chatBlock.length / 4)} tokens`);
console.log('---PREVIEW (first 2000 chars)---');
console.log(chatBlock.slice(0, 2000));
console.log('---END PREVIEW---');
console.log(`Includes 'Google Sheet'? ${chatBlock.includes('Google Sheet')}`);
console.log(`Includes 'BANEAD'? ${chatBlock.includes('BANEAD')}`);
console.log(`Includes 'NUNCA'? ${chatBlock.includes('NUNCA')}`);
console.log(`Includes 'revisar_mi_inbox_ahora'? ${chatBlock.includes('revisar_mi_inbox_ahora')}`);
