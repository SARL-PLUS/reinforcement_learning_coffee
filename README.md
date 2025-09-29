# Reinforcement Learning Coffee - Meeting Homepage

This is a simple, modern, one-page website for an informal monthly meeting about Reinforcement Learning.

## Project Structure

- `index.html`: The main HTML file containing the content and structure of the website.
- `css/style.css`: The stylesheet for the website. It provides the visual design, including layout, colors, and fonts.
- `js/script.js`: Contains JavaScript for adding interactivity to the site, such as smooth scrolling.

## How to Use

1.  Open `index.html` in your web browser to see the website.
2.  To update the sign-up link:
    - Open `js/script.js`.
    - Replace the placeholder URL in the `googleFormLink` variable with your actual Google Form link.
    - Uncomment the line `linkElement.href = googleFormLink;`.
    - Alternatively, you can directly replace `href="#"` in the sign-up anchor tag in `index.html`.
3.  To add a new event:
    - **On the homepage:** Add a new `<div class="schedule-item">...</div>` inside the `<div class="schedule-list">` in `index.html`. Be sure to set the correct status (`status-upcoming` or `status-past`).
    - **Create a details page:** Create a new HTML file inside the `/events` directory (e.g., `YYYY-MM-DD.html`). You can use `events/2025-10-03.html` as a template.
    - **Link them:** Update the `href` attribute in the new schedule item on `index.html` to point to your new details page.

## Customization

- **Fonts and Colors**: These can be changed in `css/style.css`. The site currently uses the 'Montserrat' font from Google Fonts.
- **Images**: The background image for the hero section is linked directly from Unsplash. You can replace the URL in `css/style.css` in the `#hero` style block.
