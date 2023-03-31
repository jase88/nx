import {
  addDependenciesToPackageJson,
  readProjectConfiguration,
  Tree,
  generateFiles,
  readJson,
  convertNxGenerator,
  formatFiles,
  updateProjectConfiguration,
} from '@nrwl/devkit';
import { libraryGenerator as jsLibraryGenerator } from '@nrwl/js';
import { join } from 'path';
import { nxVersion } from '../../utils/versions';
import generatorGenerator from '../generator/generator';
import { CreatePackageSchema } from './schema';
import { NormalizedSchema, normalizeSchema } from './utils/normalize-schema';

const enquirerVersion = '~2.3.6';
const yargsVersion = '~16.2.0';

export async function createPackageGenerator(
  host: Tree,
  schema: CreatePackageSchema
) {
  const options = normalizeSchema(host, schema);
  const pluginPackageName = await addPresetGenerator(host, options);

  const installTask = addDependenciesToPackageJson(
    host,
    {},
    {
      'create-nx-workspace': nxVersion,
      enquirer: enquirerVersion,
      yargs: yargsVersion,
    }
  );

  await createCliPackage(host, options, pluginPackageName);
  addTestsToE2eProject(host, options, pluginPackageName);

  await formatFiles(host);

  return installTask;
}

/**
 * Add a preset generator to the plugin if it doesn't exist
 * @param host
 * @param schema
 * @returns package name of the plugin
 */
async function addPresetGenerator(
  host: Tree,
  schema: NormalizedSchema
): Promise<string> {
  const { root: projectRoot } = readProjectConfiguration(host, schema.project);
  if (!host.exists(`${projectRoot}/src/generators/preset`)) {
    await generatorGenerator(host, {
      name: 'preset',
      project: schema.project,
      unitTestRunner: schema.unitTestRunner,
    });
  }

  return readJson(host, join(projectRoot, 'package.json'))?.name;
}

async function createCliPackage(
  host: Tree,
  options: NormalizedSchema,
  pluginPackageName: string
) {
  await jsLibraryGenerator(host, {
    ...options,
    config: 'project',
    buildable: true,
    publishable: true,
    bundler: options.bundler,
    importPath: options.importPath,
  });

  host.delete(join(options.projectRoot, 'src'));

  // Add the bin entry to the package.json
  const packageJsonPath = join(options.projectRoot, 'package.json');
  const packageJson = readJson(host, packageJsonPath);
  packageJson.bin = {
    [options.name]: './bin/index.js',
  };
  packageJson.dependencies = {
    'create-nx-workspace': nxVersion,
    enquirer: enquirerVersion,
    yargs: yargsVersion,
  };
  host.write(packageJsonPath, JSON.stringify(packageJson));

  // update project build target to use the bin entry
  const projectConfiguration = readProjectConfiguration(
    host,
    options.projectName
  );
  projectConfiguration.sourceRoot = join(options.projectRoot, 'bin');
  projectConfiguration.targets.build.options.main = join(
    options.projectRoot,
    'bin/index.ts'
  );
  projectConfiguration.targets.build.options.buildableProjectDepsInPackageJsonType =
    'dependencies';
  updateProjectConfiguration(host, options.projectName, projectConfiguration);

  // Add bin files to tsconfg.lib.json
  const tsConfigPath = join(options.projectRoot, 'tsconfig.lib.json');
  const tsConfig = readJson(host, tsConfigPath);
  tsConfig.include.push('bin/**/*.ts');
  host.write(tsConfigPath, JSON.stringify(tsConfig));

  generateFiles(
    host,
    join(__dirname, './files/create-framework-app'),
    options.projectRoot,
    {
      ...options,
      preset: pluginPackageName,
      tmpl: '',
    }
  );
}

/**
 * Add a test file to plugin e2e project
 * @param host
 * @param options
 * @returns
 */
function addTestsToE2eProject(
  host: Tree,
  options: NormalizedSchema,
  pluginPackageName: string
) {
  try {
    const pluginE2eProjectName = `${options.project}-e2e`;
    const projectConfiguration = readProjectConfiguration(
      host,
      pluginE2eProjectName
    );
    generateFiles(
      host,
      join(__dirname, './files/e2e'),
      projectConfiguration.sourceRoot,
      {
        ...options,
        preset: pluginPackageName,
        tmpl: '',
      }
    );
  } catch (e) {
    // if e2e project does not exist, do not add tests
    return;
  }
}

export default createPackageGenerator;
export const createPackageSchematic = convertNxGenerator(
  createPackageGenerator
);