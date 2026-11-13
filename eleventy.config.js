module.exports = function () {
    return {
        dir: {
            input: "src",
            output: ".",
            includes: "_includes",
            data: "_data",
        },
        templateFormats: ["njk"],
        htmlTemplateEngine: "njk",
    };
};
