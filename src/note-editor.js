import { ink } from "ink-mde";

export class NoteEditor {
  #root;
  #onChange;
  #instance = null;
  #instanceReady;
  #queuedValue = "";
  #suppressChange = false;

  constructor({ root, onChange }) {
    this.#root = root;
    this.#onChange = onChange;
    this.#instanceReady = this.#mount();
  }

  setValue(value) {
    this.#queuedValue = value;

    void this.#instanceReady.then(() => {
      if (!this.#instance) {
        return;
      }

      if (this.#instance.getDoc() === value) {
        return;
      }

      this.#suppressChange = true;
      this.#instance.update(value);
      this.#suppressChange = false;
    });
  }

  focus() {
    void this.#instanceReady.then(() => {
      this.#instance?.focus();
    });
  }

  destroy() {
    this.#instance?.destroy();
    this.#instance = null;
  }

  async #mount() {
    this.#instance = await ink(this.#root, {
      doc: this.#queuedValue,
      interface: {
        appearance: "auto",
        attribution: false,
        autocomplete: false,
        images: false,
        lists: true,
        readonly: false,
        spellcheck: true,
        toolbar: false,
      },
      hooks: {
        afterUpdate: (doc) => {
          if (this.#suppressChange) {
            return;
          }

          this.#queuedValue = doc;
          this.#onChange?.(doc);
        },
      },
      keybindings: {
        shiftTab: true,
        tab: true,
      },
      lists: {
        bullet: true,
        number: true,
        task: true,
      },
      placeholder: "Write markdown…",
      readability: false,
      search: false,
    });

    if (this.#queuedValue && this.#instance.getDoc() !== this.#queuedValue) {
      this.#suppressChange = true;
      this.#instance.update(this.#queuedValue);
      this.#suppressChange = false;
    }
  }
}
