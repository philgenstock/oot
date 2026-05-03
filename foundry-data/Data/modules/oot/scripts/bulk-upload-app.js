export class BulkUploadApplication extends Application {
  constructor(options = {}) {
    super(options);
    this._files = [];
    this._destPath = "";
  }

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "oot-bulk-upload",
      title: "Bulk Asset Upload",
      template: "modules/oot/templates/bulk-upload.hbs",
      classes: ["oot-bulk-upload-window"],
      width: 480,
      height: "auto",
      resizable: false
    });
  }

  getData() {
    return {};
  }

  activateListeners(html) {
    super.activateListeners(html);
    html.find('.browse-dest').click(() => this._browseDestination());
    html.find('.select-folder').click(() => html.find('.folder-input').click());
    html.find('.folder-input').on('change', e => this._onFilesSelected(e));
    html.find('.upload-btn').click(() => this._startUpload());
  }

  _browseDestination() {
    new FilePicker({
      type: "folder",
      current: this._destPath || "",
      callback: (path) => {
        this._destPath = path;
        this.element.find('.dest-path-input').val(path);
      }
    }).browse();
  }

  _onFilesSelected(event) {
    this._files = Array.from(event.target.files);
    const el = this.element;
    if (this._files.length > 0) {
      const size = this._formatSize(this._files.reduce((s, f) => s + f.size, 0));
      el.find('.file-summary')
        .html(`<i class="fas fa-check-circle"></i> ${this._files.length} files selected (${size})`)
        .removeClass('empty');
      el.find('.upload-btn').prop('disabled', false);
    }
  }

  async _startUpload() {
    if (!this._files.length) return;

    const dest = this._destPath.replace(/\/$/, '');
    if (!dest) {
      ui.notifications.warn("Please select a destination folder first.");
      return;
    }

    const el = this.element;
    el.find('.upload-btn, .select-folder, .browse-dest').prop('disabled', true);
    el.find('.upload-progress').show();

    const progressFill = el.find('.upload-progress-fill');
    const progressText = el.find('.upload-progress-text');

    const source = "data";
    const createdDirs = new Set();
    const errors = [];

    for (let i = 0; i < this._files.length; i++) {
      const file = this._files[i];
      const parts = file.webkitRelativePath.split('/');
      parts.shift(); // strip root folder name
      parts.pop();   // strip filename (file.name already has it)

      let uploadDir = dest;

      if (parts.length > 0) {
        for (let j = 0; j < parts.length; j++) {
          const subPath = dest + '/' + parts.slice(0, j + 1).join('/');
          if (!createdDirs.has(subPath)) {
            try {
              await FilePicker.createDirectory(source, subPath);
            } catch (e) {
              // directory likely already exists, safe to ignore
            }
            createdDirs.add(subPath);
          }
        }
        uploadDir = dest + '/' + parts.join('/');
      }

      try {
        await FilePicker.upload(source, uploadDir, file, {}, { notify: false });
      } catch (e) {
        errors.push(file.webkitRelativePath);
      }

      const percent = Math.round(((i + 1) / this._files.length) * 100);
      progressFill.css('width', percent + '%');
      progressText.text(`Uploading ${i + 1} of ${this._files.length}...`);
    }

    if (errors.length) {
      ui.notifications.warn(`Upload finished with ${errors.length} error(s). ${this._files.length - errors.length} files uploaded successfully.`);
    } else {
      ui.notifications.info(`Successfully uploaded ${this._files.length} file(s) to ${dest}.`);
    }

    this.close();
  }

  _formatSize(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1048576).toFixed(1)} MB`;
  }
}
