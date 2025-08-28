# 3D Gerber Viewer

A modern, browser-based 3D Gerber viewer built with JavaScript, Three.js, and the `pcb-stackup` library. This tool allows you to upload a `.zip` file containing your PCB Gerber files and instantly visualize the board in 3D. You can inspect both sides, customize colors, and export 2D views as SVG or high-resolution PNG files.

### [View the Live Demo](https://petervanderwalt.github.io/javascript-gerber-viewer/)

## Features

*   **Interactive 3D View**: Pan, zoom, and rotate your PCB model with intuitive mouse controls (powered by Three.js).
*   **Easy File Upload**: Open a `.zip` archive of your Gerber files.
*   **Real-time Color Customization**:
    *   Change the soldermask color (Green, Purple, Red, Yellow, Blue, White, Black).
    *   Adjust the silkscreen color (White, Black).
    *   Select the copper finish (HASL or ENIG).
*   **2D Previews**: Instantly see 2D thumbnail previews of the top and bottom sides of your board.
*   **Vector & Raster Exports**:
    *   Download 2D views of the top and bottom layers as clean **SVG** files.
    *   Export high-quality **PNG** images with a user-defined DPI for documentation or presentations.

## Technology Stack

This project leverages modern web technologies to run entirely in the browser without any server-side processing.

*   **3D Rendering**: [Three.js](https://threejs.org/) is used for creating and displaying the 3D PCB model.
*   **Gerber Processing**: The excellent [tracespace/pcb-stackup](https://github.com/tracespace/tracespace/tree/main/packages/pcb-stackup) library processes the raw Gerber files and converts them into SVG layers.
*   **File Handling**: [JSZip](https.github.com/Stuk/jszip) is used to read the `.zip` archive directly in the browser.
*   **UI Framework**: [Bootstrap 5](https://getbootstrap.com/) provides the responsive layout and user interface components.
*   **Dependencies**: All libraries are loaded via CDN, making the project easy to set up and run.

## Local Development

To run this project on your local machine, you'll need [Node.js](https://nodejs.org/) installed.

1.  Clone the repository:
    ```sh
    git clone https://github.com/petervanderwalt/javascript-gerber-viewer.git
    ```
2.  Navigate to the project directory:
    ```sh
    cd javascript-gerber-viewer
    ```
3.  Since the project uses ES Modules (`import`), you need to serve the files from a local web server to avoid browser security (CORS) errors. The recommended way is to use `http-server` via `npx`, which comes bundled with Node.js/npm.

    Run the following command in the project's root directory:
    ```sh
    npx http-server
    ```
4.  Your terminal will display a list of local URLs. Open one of them in your web browser, typically `http://127.0.0.1:8080`.
