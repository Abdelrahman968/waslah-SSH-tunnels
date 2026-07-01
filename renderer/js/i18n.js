'use strict';

const I18N = {
  dict: {},
  lang: 'ar',

  async load(lang) {
    const res = await fetch(`i18n/${lang}.json`);
    this.dict = await res.json();
    this.lang = lang;
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
  },

  t(key) {
    return this.dict[key] || key;
  },

  apply(root = document) {
    root.querySelectorAll('[data-i18n]').forEach((el) => {
      el.textContent = this.t(el.getAttribute('data-i18n'));
    });
    root.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
      el.setAttribute('placeholder', this.t(el.getAttribute('data-i18n-placeholder')));
    });
  },
};
