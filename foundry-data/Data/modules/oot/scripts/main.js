Hooks.once('init', async function() {
  console.log('OOT | Initializing module');
});

Hooks.on('renderChatMessage', async function(_message, html) {

  // Find the card content that should be collapsed
  const cardContent = html.find('.card-content, .dnd5e2.chat-card .card-content');

  if (cardContent.length > 0) {
    // Add collapsed class by default
    cardContent.addClass('collapsed-description');

    // Find or create toggle button
    let toggleButton = html.find('.description-toggle');

    if (toggleButton.length === 0) {
      // Create a toggle button if it doesn't exist
      const header = html.find('.card-header, .dnd5e2.chat-card header');

      if (header.length > 0) {
        toggleButton = $('<div class="description-toggle">▶ Show Details</div>');
        header.after(toggleButton);
      }
    }

    // Add click handler to toggle
    toggleButton.on('click', function(event) {
      event.preventDefault();
      event.stopPropagation();

      const content = $(this).siblings('.card-content');
      content.toggleClass('expanded');

      if (content.hasClass('expanded')) {
        $(this).html('▼ Hide Details');
      } else {
        $(this).html('▶ Show Details');
      }
    });
  }
});
