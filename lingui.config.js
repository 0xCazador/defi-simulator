/** @type {import('@lingui/conf').LinguiConfig} */
module.exports = {
   locales: ["af", "ak", "am", "ar", "ar-AE", "ar-BH", "ar-DZ", "ar-EG", "ar-IQ", "ar-JO", "ar-KW", "ar-LB", "ar-LY", "ar-MA", "ar-OM", "ar-QA", "ar-SA", "ar-SY", "ar-TN", "ar-YE", "arn", "as", "az", "az-Cyrl-AZ", "az-Latn-AZ", "ba", "be", "bg", "bm", "bn", "bn-BD", "bn-IN", "bo", "br", "bs", "bs-Cyrl", "bs-Latn", "ca", "co", "cs", "cy", "da", "de", "de-AT", "de-CH", "de-DE", "de-LI", "de-LU", "dsb", "dv", "ee", "el", "en", "en-029", "en-AU", "en-BZ", "en-CA", "en-GB", "en-IE", "en-IN", "en-JM", "en-MY", "en-NZ", "en-PH", "en-SG", "en-TT", "en-US", "en-ZA", "en-ZW", "eo", "es", "es-AR", "es-BO", "es-CL", "es-CO", "es-CR", "es-DO", "es-EC", "es-ES", "es-GT", "es-HN", "es-MX", "es-NI", "es-PA", "es-PE", "es-PR", "es-PY", "es-SV", "es-US", "es-UY", "es-VE", "et", "eu", "fa", "fi", "fil", "fo", "fr", "fr-BE", "fr-CA", "fr-CH", "fr-FR", "fr-LU", "fr-MC", "fy", "ga", "gd", "gl", "gn", "gsw", "gu", "ha", "he", "hi", "hr", "hr-BA", "hr-HR", "hsb", "ht", "hu", "hy", "id", "ig", "ii", "is", "it", "it-CH", "it-IT", "iu", "ja", "jv", "ka", "kg", "ki", "kk", "kl", "km", "kn", "ko", "kok", "kr", "ks", "ky", "lb", "lg", "ln", "lo", "lt", "lv", "mg", "mi", "mk", "ml", "mn", "mn-MN", "mn-Mong-CN", "moh", "mr", "ms", "ms-BN", "ms-MY", "mt", "my", "nb", "nb-NO", "ne", "nl", "nl-BE", "nl-NL", "nn", "no", "nso", "ny", "oc", "om", "or", "pa", "pl", "prs", "ps", "pt", "pt-BR", "pt-PT", "qu", "quc", "rm", "rn", "ro", "ru", "rw", "sa", "sah", "sc", "sd", "se", "si", "sk", "sl", "sn", "so", "sq", "sr", "sr-Cyrl-BA", "sr-Cyrl-SP", "sr-Latn-BA", "sr-Latn-SP", "st", "su", "sv", "sv-FI", "sv-SE", "sw", "syr", "ta", "te", "tg", "th", "ti", "tk", "tl", "tn", "tr", "ts", "tt", "tzm", "ug", "uk", "ur", "uz", "uz-Cyrl-UZ", "uz-Latn-UZ", "ve", "vi", "wo", "xh", "yo", "zh-CN", "zh-Hans", "zh-Hant", "zh-HK", "zh-MO", "zh-SG", "zh-TW", "zu"],
   catalogs: [{
      path: "src/locales/{locale}/messages",
      include: ["./components", "./pages"]
   }],
   format: "po",
   service: {
    name: "TranslationIO",
    apiKey: "7945437f43044617aa3eadaf0cb7e184"
  }
}