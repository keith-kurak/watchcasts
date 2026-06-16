const { withProjectBuildGradle } = require("expo/config-plugins");

/**
 * Injects the play-services-wearable dependency into the :expo project's
 * classpath. Inline modules are compiled as part of :expo, not :app, so the
 * dependency must be added there.
 */
module.exports = function withWearableDataLayer(config) {
  return withProjectBuildGradle(config, (config) => {
    const dep =
      'com.google.android.gms:play-services-wearable:19.0.0';
    if (!config.modResults.contents.includes("play-services-wearable")) {
      const snippet = `
subprojects { subproject ->
    if (subproject.name == "expo") {
        subproject.afterEvaluate {
            dependencies {
                implementation("${dep}")
            }
        }
    }
}`;
      config.modResults.contents += snippet;
    }
    return config;
  });
};
