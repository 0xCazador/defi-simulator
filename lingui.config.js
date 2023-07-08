/** @type {import('@lingui/conf').LinguiConfig} */
module.exports = {
   locales: ["en", "cs", "fr"],
   catalogs: [{
      path: "src/locales/{locale}/messages",
      include: ["./components", "./pages"]
   }],
   format: "po"
}