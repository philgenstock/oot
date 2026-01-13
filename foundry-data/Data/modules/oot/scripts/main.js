Hooks.once('init', async function() {
  console.log('OOT | Initializing module');
});

Hooks.on('renderChatMessage', async function(_message, html) {
  // Find the existing dnd5e chevron toggle button
  const toggleButton = html.find('.fa-chevron-down');
  console.warn('oot')
  if (toggleButton.length > 0) {
    // Click the toggle to collapse the content by default
    toggleButton.click();
  }
});
