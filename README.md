# Fanaan AI Dashboard

This is a central hub for interacting with powerful AI models from various providers like Google (Veo, Gemini), Groq, Anthropic (Claude), OpenAI (ChatGPT), and more.

## Project Setup

This project uses Vite for a fast development experience and Tailwind CSS for styling.

### Prerequisites

- Node.js (v18 or newer)
- npm or yarn

### Installation & Running Locally

1.  **Clone the repository:**
    ```bash
    git clone <repository_url>
    cd fanaan-ai-dashboard
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

3.  **Run the development server:**
    ```bash
    npm run dev
    ```
    The application will be available at `http://localhost:5173` (or another port if 5173 is busy).

### Building for Production

To create a production-ready build of the application, run:

```bash
npm run build
```

This will generate a `dist` folder in the project root containing the optimized static assets.

---

## Deployment Guide: Proxmox LXC Container

This guide explains how to deploy the Fanaan AI Dashboard to a Proxmox LXC container using Nginx as a web server.

### 1. Create the LXC Container

1.  In your Proxmox web UI, click **Create CT**.
2.  Choose a **Hostname** (e.g., `ai-dashboard`).
3.  Select a **Template**. A recent Debian or Ubuntu template is recommended (e.g., `ubuntu-22.04-standard` or `debian-12-standard`).
4.  Set the **Disk size** (8GB is sufficient).
5.  Assign **CPU cores** and **Memory** (1 core and 512MB RAM is a good starting point).
6.  Configure the **Network**. A static IP address is recommended for easy access.
7.  Confirm and finish the setup.

### 2. Prepare the Container

1.  Start the container from the Proxmox UI.
2.  Open the container's console or SSH into it.
3.  Update the package list and install necessary tools:
    ```bash
    apt update && apt upgrade -y
    apt install -y nodejs npm git nginx curl
    ```
    *Note: The version of Node.js from the default repositories might be old. For a specific version, you might need to use a source like NodeSource.*

### 3. Clone and Build the Project

1.  Navigate to a suitable directory (e.g., `/var/www`).
    ```bash
    cd /var/www
    ```
2.  Clone your project repository:
    ```bash
    git clone <your_repository_url>
    cd fanaan-ai-dashboard # Or your project's directory name
    ```
3.  Install project dependencies and build the application:
    ```bash
    npm install
    npm run build
    ```
    This command will create a `dist` directory containing the static files to be served.

### 4. Configure Nginx

1.  Create a new Nginx configuration file for your site.
    ```bash
    nano /etc/nginx/sites-available/fanaan-ai
    ```

2.  Paste the following configuration into the file. **Make sure to replace `/var/www/fanaan-ai-dashboard/dist` with the actual path to your project's `dist` folder.**

    ```nginx
    server {
        listen 80;
        server_name <your_lxc_ip_address_or_domain>; # e.g., 192.168.1.123

        root /var/www/fanaan-ai-dashboard/dist;
        index index.html;

        # This line is crucial. It ensures Nginx knows the correct MIME types
        # for files like .js (JavaScript) and .css (stylesheets). While this
        # is often in the global nginx.conf, including it here makes the
        # configuration more robust and prevents common errors.
        include /etc/nginx/mime.types;

        location / {
            # This is the standard "try files" rule for a Single Page Application (SPA)
            # It tries to serve the requested file directly, and if it fails,
            # it falls back to serving index.html, allowing the client-side
            # router to handle the URL.
            try_files $uri $uri/ /index.html;
        }

        # Optional: Add headers for security
        add_header X-Frame-Options "SAMEORIGIN";
        add_header X-Content-Type-Options "nosniff";
        add_header X-XSS-Protection "1; mode=block";
    }
    ```

3.  Save the file (`Ctrl+O`, `Enter`) and exit (`Ctrl+X`).

4.  Enable the new site by creating a symbolic link and disable the default site:
    ```bash
    ln -s /etc/nginx/sites-available/fanaan-ai /etc/nginx/sites-enabled/
    rm /etc/nginx/sites-enabled/default
    ```

5.  Test the Nginx configuration for syntax errors:
    ```bash
    nginx -t
    ```

6.  If the test is successful, restart Nginx to apply the changes:
    ```bash
    systemctl restart nginx
    ```

### 5. Access Your Application

Your Fanaan AI Dashboard should now be accessible by navigating to the LXC container's IP address in your web browser.
```
http://<your_lxc_ip_address>
```
