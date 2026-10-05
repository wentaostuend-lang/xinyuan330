const results = document.getElementById('results');
const check = (condition, message) => {
  if (!condition) throw new Error(message);
  results.textContent += '\n通过：' + message;
};
async function loadFontPage() {
  const parse = text => new DOMParser().parseFromString(text, 'text/html');
  const fontHtml = parse(await (await fetch('../../src/html/appearance-and-thoughts.html')).text());
  document.getElementById('phone-screen').appendChild(fontHtml.getElementById('font-settings-screen'));
  const chatHtml = parse(await (await fetch('../../src/html/chat-settings-extra.html')).text());
  document.getElementById('chat-settings-controls').appendChild(chatHtml.getElementById('chat-font-size-slider').closest('.settings-item'));
  for (const id of ['custom-css-input', 'lyrics-vertical-pos', 'lyrics-horizontal-pos', 'lyrics-offset-input']) {
    const input = document.createElement('input'); input.id = id; document.getElementById('chat-settings-controls').appendChild(input);
  }
  const preview = document.createElement('div'); preview.id = 'settings-preview-area'; document.getElementById('chat-settings-controls').appendChild(preview);
  bindFontSettingsEvents(); openFontSettings(); await applyCustomFont('');
  document.getElementById('chat-font-size-slider').value = state.chats.test.settings.fontSize;
  results.textContent = '真实字体控件已就绪';
  document.getElementById('run').disabled = false;
}
document.getElementById('run').onclick = async () => {
  results.textContent = '开始字号兼容检查';
  const runButton = document.getElementById('run'); runButton.disabled = true;
  try {
    const slider = document.getElementById('font-size-slider');
    check(slider.min === '10' && slider.max === '28' && slider.value === '20', '旧全局范围与保存值恢复');
    check(getComputedStyle(document.body).fontSize === '20px', '默认字体也应用保存的 20px');
    check(getComputedStyle(document.getElementById('chat-input')).fontSize === '16px', '输入框仍为 16px');
    const before = dynamicFontStyle.textContent;
    slider.value = '24'; slider.dispatchEvent(new Event('input', { bubbles: true }));
    check(state.globalSettings.globalFontSize === 20 && dynamicFontStyle.textContent === before, '字号草稿不污染正式设置');
    check(document.getElementById('font-preview').style.fontSize === '24px', '预览使用草稿字号');
    check(await saveFontSettings(), '字号保存成功');
    check(fontWrites.at(-1).globalFontSize === 24 && getComputedStyle(document.body).fontSize === '24px', '保存值与实际应用一致');
    check(getComputedStyle(document.getElementById('chat-input')).fontSize === '16px', '保存后输入框没有缩放');
    const chatSlider = document.getElementById('chat-font-size-slider');
    check(chatSlider.min === '12' && chatSlider.max === '20' && chatSlider.value === '18', '旧独立聊天范围与保存值恢复');
    await updateSettingsPreview();
    check(document.getElementById('settings-preview-area').style.getPropertyValue('--chat-font-size') === '18px', '实际加载的聊天预览读取独立字号');
    const chatMessages = document.getElementById('chat-messages'); chatMessages.style.setProperty('--chat-font-size', `${state.chats.test.settings.fontSize || 13}px`);
    check(getComputedStyle(chatMessages.querySelector('.message-bubble')).fontSize === '18px', '聊天正文不与全局字号叠乘');
    const partial = normalizeFontSettings(state.globalSettings); partial.fontScope.all = false; partial.fontScope.other = false; partial.fontScope.qq = false;
    applyFontSettings(partial);
    check(getComputedStyle(document.body).fontSize === '16px', '未选中的其他区域恢复原字号');
    check(getComputedStyle(document.getElementById('font-settings-screen')).fontSize === '24px', '选中设置区域保持原选择字号');
    check(getComputedStyle(document.getElementById('chat-input')).fontSize === '16px', '范围切换不影响输入字号');
    const local = document.createElement('style'); local.textContent = '#chat-input{font-size:19px !important}'; document.head.appendChild(local);
    applyFontSettings({ globalFontSize: 10 });
    check(getComputedStyle(document.getElementById('chat-input')).fontSize === '19px', '用户自定义 CSS 保持原样'); local.remove();
    document.getElementById('reset-font-size-btn').click();
    check(state.globalSettings.globalFontSize === 24 && getFontDraft().globalFontSize === 16, '重置字号仅改变编辑草稿');
    await saveFontSettings();
    check(getComputedStyle(document.body).fontSize === '16px' && state.globalSettings.globalFontSize === 16, '保存重置恢复旧默认字号');
    results.textContent += '\n完成：全部字号浏览器检查通过。';
  } catch (error) { results.textContent += '\n失败：' + error.stack; }
  finally { runButton.disabled = false; }
};
loadFontPage().catch(error => { results.textContent = '加载失败：' + error.stack; });
