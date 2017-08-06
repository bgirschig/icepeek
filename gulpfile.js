// handles build of client code. (browserify, minify etc)
// does not handle app building (that's cordova's job)

const del = require('del');
const gulp = require('gulp');
const browserify = require('browserify');
const source = require('vinyl-source-stream');
const buffer = require('vinyl-buffer');
const gutil = require('gulp-util');
const uglify = require('gulp-uglify');
const sourcemaps = require('gulp-sourcemaps');
const path = require('path');
const watch = require('gulp-watch');
const tap = require('gulp-tap');
const babel = require('gulp-babel');
const minimatch = require("minimatch");
const notifier = require('node-notifier');
const child_process = require('child_process');
const pug = require('gulp-pug');

const options = {
	src:"src",
	dest:"client",
	jsEntry:"main.js",
	devmode:true,
	staticFiles:["*.html", "images/*", "style/*.css", "fonts/**/*"],
	language:"FR" 
}
options.strings = require("./"+options.src+"/strings/"+options.language+".json")

gulp.task('build', ()=>{
	gulp.start('js');
	gulp.start('copyStatic');
	gulp.start('pug');
});

gulp.task('js', ()=>jsTask(options.jsEntry));
function jsTask(src,log=false){
  child_process.spawn("npm", ["test"], {stdio:'inherit'})
  .on('exit', (code, data)=>{ if(code!=0) logNotify("some tests failed"); })
  
  if(log) console.log("[run] jsTask");

  return gulp.src(src, {read: false, cwd:options.src, base:options.src})
    .pipe(tap(function (file) {
        let relativePath = path.relative(path.resolve(options.src), file.path);

        let stream = browserify(file.path, {debug: true})
        .bundle()
        .on('error', logNotifyErrorHandler)
        .pipe(source(relativePath))
        .pipe(buffer())
        if(!options.devmode){
          stream = stream
          // no need for source map in prod, and no need for uglify in dev.
          // .pipe(sourcemaps.init({loadMaps: true}))
          .pipe(babel({presets: ['es2015']}))
          .pipe(uglify())
          .on('error', logNotifyErrorHandler)
          // .pipe(sourcemaps.write("./"))
        }
        stream = stream.pipe(gulp.dest(options.dest));
        return stream
    }))
}

// .pugm is a custom extension (short for pug main), to identify pug entry files from their extensions
gulp.task("pug", ()=>pugTask("**/*.pugm"))
function pugTask(src, logline=false){
	if(logline) console.log("[run] copyTask")
	locals = {
		strings:options.strings
	}
	console.log(locals)
	return gulp.src(src, {cwd:options.src, base:options.src})
  	.pipe(pug({locals:locals}).on('error', logNotifyErrorHandler))
  	.pipe(gulp.dest(options.dest));
}

gulp.task('copyStatic', ()=>copy(options.staticFiles))
function copy(src, logline=false){
	if(logline) console.log("[run] copyTask")
  	return gulp.src(src, {cwd:options.src, base:options.src})
  	.pipe(gulp.dest(options.dest));
}


gulp.task('watch', function(){
	gulp.watch(["src/**/*", "tests/**/*"])
	.on("change", function(event){
		let relativePath = path.relative(path.resolve(options.src), event.path);
		let extension = path.extname(event.path);
		let destPath = path.resolve(options.dest, relativePath);
		
		// If the file was deleted, delete its counterpart in build
		if(event.type === "deleted") del.sync(destPath, {force:true});
		// If one of the entry points was modified, only rebuild that one
		else if(multimatch(relativePath, options.jsEntry)) jsTask(relativePath, true);
		else if([".pugm"].includes(extension)) pugTask(relativePath, true);
		// Otherwise, run task according to extension
		else if([".js"].includes(extension)) gulp.start('js');
		else if([".pug"].includes(extension)) gulp.start('pug');
		else if(multimatch(relativePath, options.staticFiles)) copy(relativePath);
		// if file is a strings file, recompile html sources
		else if(relativePath.startsWith("strings/")) gulp.start('pug');
		// If all fails, notify.
		else logNotify("[watch] There is no handler for this file: "+relativePath);
	})
})

////////////// util functions //////////////
// does the path match any of the patterns ?
function multimatch(path, patterns){
  if(Array.isArray(patterns)) return patterns.some(pattern => minimatch(path,pattern))
  else return minimatch(path, patterns);
}
function logNotify(text="unknown error", err=null){
	console.log(err || text);
	text = cleanErrorMessage(text);
	notifier.notify({
		title: 'Gulp Error',
  		message: text,
		sound: true,
		actions : "OK"
	});
}
function logNotifyErrorHandler(err){
  logNotify(err.message,err.stack||err);
  this.emit('end');
}
function cleanErrorMessage(path){
	return replaceAll(path, __dirname, "").replace(/\s'\//, " '");
}
function replaceAll(target, search, replacement){
	return target.split(search).join(replacement)
}
////////////// util functions end //////////

gulp.task('default', ["build"]);