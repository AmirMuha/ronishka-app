const {Miladi_Jalali} = require("../utilities/convertDate")
const {
	Content
} = require("../models/contents")
const {
	Category
} = require("../models/categories")
const {
	Product
} = require("../models/products")
const {
	Message
} = require("../models/messages")
const fs = require("fs")
const d = require("debug")("app:content-creating-controller")
const ERR = require("../utilities/ERR")
const slugify = require("slugify")
const path = require("path")
const Jimp = require("jimp")
const {
	promisify
} = require('util');
const {
	User
} = require("../models/users")
function dateJustNow () {
		const dateObj = new Date;
		const year = dateObj.getFullYear().toString() * 1;
		const month = dateObj.getMonth().toString() * 1 === 0 ? 1: dateObj.getMonth().toString() * 1;
		const day = dateObj.getDate().toString() * 1;
		return Miladi_Jalali(year, month, day);
	}
function timeJustNow () {
	const dateO = new Date;
	const hour = dateO.getHours();
	const minute = dateO.getMinutes();
	const second = dateO.getSeconds();
	return `${
		hour <= 12 ? (hour < 6 ? 'بامداد':'صبح'):"بعداز ظهر"
	}   ${
		hour.toString()
	}:${
		minute.toString()
	}:${
		second.toString()
	}`;
}
exports.uploadingImage = async (req, res, next) => {
	let contentImages = req.session.contentImages;
	let pathToSave = req.session.pathToSave;
	let content_id = req.session.content_id;
	let imageName = req.session.imageName;
	const content = await Content.findById(content_id) 
	if (!content) return next(new ERR("محتوایی با این آیدی وجود ندارد.", 404))
	let image = req.files.image;
	if (image.size > 1000000) return next(new ERR("تصاویر باید کمتر از 1 مگابایت حجم داشته باشند.", 400))
	imageName = `image-content-${Date.now()}.${image.mimetype.split("/")[1]}`;
	pathToSave = path.join(__dirname, '../public', 'uploads', 'images', 'temp', imageName);
	Jimp.read(image.data)
		.then(theImg => {
			return theImg
				.resize(900,600)
				.write(pathToSave);
		})
		.catch(()=>{
			return next(new ERR("مشکلی در تغییر سایز تصویر بوجود آمده است لطفا این مشکل را با پشتیبانی سایت در میان بگذارید. باتشکر",500))
		})
	contentImages.push(imageName)
	d('new image uploaded from editorjs.')
	res.status(200).json({
		success: 1,
		file: {
			url: `/uploads/images/temp/${imageName}`,
		}
	})
}
exports.uploadingFile = async(req,res,next)=>{
	let contentFiles = req.session.contentFiles;
	let pathToFileLocation_temp = req.session.pathToFileLocation_temp;
	let fileName_temp = req.session.fileName_temp;
	if (req.files.file.size > 50000000) return next(new ERR('حجم فایل نباید بیشتر از 5 مگابایت باشد.', 400))
	fileName_temp = `file-${Date.now()}.${(req.files.file.mimetype).split("/")[1]}`;
	pathToFileLocation_temp = path.join(__dirname, '../public', 'uploads', 'files', 'temp', fileName_temp);
	await req.files.file.mv(pathToFileLocation_temp);
	d('new file uploaded from editorjs.') 
	contentFiles.push(fileName_temp);
	res.status(200).json({
		success: 1,
		file: {
			url: `/uploads/files/temp/${fileName_temp}`,
			name: fileName_temp
		}
	})
}
exports.downloadFile = async(req,res)=>{
	res.download(path.join(__dirname,'../public','uploads','files',req.params.file),req.params.filename)
}
// ####################################################### storing the conent into database
exports.createContent = async (req, res, next) => {
	req.body.topic = req.body.topic.split("  ").join(" ");
	let topicSlug = slugify(`${req.body.topic}`, {
		replacement: '-',
		locale: 'fa',
		remove: /[*+~.,()'"!:@]/g
	});
	let TopicValid = topicSlug.split("-").join(" ");
	const IsContentExist = await Content.findOne({
		slug: topicSlug
	});
	if (IsContentExist) return next(new ERR("این موضوع قبلا استفاده شده لطفا موضوع دیگری انتخاب کنید.", 400))
	const coverImageFile = req.files.coverImage;
	if (coverImageFile.size > 1000000) return res.status(400).json({message:"تصاویر باید کمتر از 1 مگابایت حجم داشته باشند."})
	let coverImageName;
	let saveCoverImgTo;
	coverImageName = `image-cover-${Date.now()}.${coverImageFile.mimetype.split("/")[1]}`;
	saveCoverImgTo = path.join(__dirname, '../public', 'uploads', 'images', 'content-cover-images', coverImageName);
	const user = await User.findById(req.user._id);
	if (!user.categories.includes(req.body.category)) return next(new ERR(`شما اجازه تولید محتوا برای ${req.body.category} را ندارید.`, 400))
	const {
		category,
		resource,
		keywords,
		summary,
		metaDescription
	} = req.body;
	const content = await new Content({
		topic:TopicValid,
		category,
		resource, 
		coverImage: coverImageName,
		keywords: keywords.includes("،") ? keywords.split("،") : keywords.split(","),
		summary,
		metaDescription
	});
	await User.findOneAndUpdate({
		_id: req.user._id
	}, {
		$push: {
			contents: content._id
		}
	});
	const categ = await Category.findOneAndUpdate({
		slug: category.trim()
	}, {
		$push: {
			contents: content._id
		}
	});
	if (!categ) return next(new ERR("مشکلی در این قسمت از جانب سایت رخ داده است لطفا زمانی دیگر امتحان کنید.", 500))
	await coverImageFile.mv(saveCoverImgTo);
	await content.save();
	d('new contnet uploaded.')
	res.status(201).json({
		content,
		User: req.user
	})
}
exports.checkContent = async (req, res) => {
	const content = await Content.findById(req.body.contentID.trim());
	if (!content) {
		return res.status(404).json({message:"محتوایی با این آیدی وجود ندارد."}) 
	}
	let contentImages = req.session.contentImages;
	let contentFiles = req.session.contentFiles;
	if(content.post.length > 0||content.images.length > 0||content.files.length > 0) {
		content.post.forEach(el=>{
			if(el.type === "image"){
				const imageName = el.data.file.url.match(/[\/\\]([\w\d\s\.\-\(\)]+)$/)[1]
				contentImages.push(imageName)
				if(fs.existsSync(path.join(__dirname,"../public","uploads","images","content",imageName))){
					fs.renameSync(path.join(__dirname,"../public","uploads","images","content",imageName),path.join(__dirname,'../public','uploads','images','temp',imageName))
				}
			}else if(el.type === "attaches"){
				const fileName = el.data.file.url.match(/[\/\\]([\w\d\s\.\-\(\)]+)$/)[1]
				contentFiles.push(fileName)
				if(fs.existsSync(path.join(__dirname,"../public","uploads","files",fileName))){
					fs.renameSync(path.join(__dirname,"../public","uploads","files",fileName),path.join(__dirname,'../public','uploads','files','temp',fileName))
				}
			}
		})
	}

	req.session.content_id = content._id;
	res.status(200).json({
		status: "success",
		message: 'محتوا با موفقیت پیدا شد.'
	})
}
exports.createPost = async (req, res, next) => {
	let contentFiles = req.session.contentFiles 
	let contentImages = req.session.contentImages;
	let content_id = req.session.content_id;

	const checkIDIndex = req.body.blocks.length - 1;
	const content = await Content.findById(content_id);
	if (!content) {
		contentFiles = [];
		contentImages = [];
		return next(new ERR("پستی با آیدی وارد شده پیدا نشد، لطفا صفحه را رفرش و دوباره امتحان کنید.", 404))
	}	
	let unUsedImages = []
	req.body.blocks.forEach(el=>{
		if(el.type === 'image'){
			unUsedImages.push(el.data.file.url.match(/[\/\\]([\w\d\s\.\-\(\)]+)$/)[1])
		}
	})
	const unUsedImagesArray = req.session.contentImages.filter(e => !unUsedImages.includes(e))
	unUsedImagesArray.forEach(el=>{
		if(fs.existsSync(path.join(__dirname,'../public','uploads','images','temp',el))){
			fs.unlinkSync(path.join(__dirname,'../public','uploads','images','temp',el))
		}
	})
	let unUsedFiles = []
	req.body.blocks.forEach(el=>{
		if(el.type === 'attaches'){
			unUsedFiles.push(el.data.file.url.match(/[\/\\]([\w\d\s\.\-\(\)]+)$/)[1])
		}
	})
	const unUsedFilesArray = req.session.contentFiles.filter(e => !unUsedFiles.includes(e))
	unUsedFilesArray.forEach(el => {
		if(fs.existsSync(path.join(__dirname,'../public','uploads','files','temp',el))){
			fs.unlinkSync(path.join(__dirname,'../public','uploads','files','temp',el))
		}
	})
	const mv = promisify(fs.rename);
	if (contentImages && contentImages.length > 0) {
		contentImages.forEach(async contImage => {
			if(fs.existsSync(path.join(__dirname, '../public', 'uploads', 'images', 'temp', contImage))){
				await mv(path.join(__dirname, '../public', 'uploads', 'images', 'temp', contImage), path.join(__dirname, '../public', 'uploads', 'images', 'content', contImage));
				contentImages = [];
			}
		})
	}
	if (contentImages && contentFiles.length > 0) {
		contentFiles.forEach(async contFile => {
			if(fs.existsSync(path.join(__dirname, '../public', 'uploads', 'files','temp', contFile))){
				await mv(path.join(__dirname, '../public', 'uploads', 'files','temp', contFile), path.join(__dirname, '../public', 'uploads', 'files', contFile));
				contentFiles = [];
			}
		})
	}

	const persianDate = dateJustNow()
  const timeCreated = timeJustNow()
	await Content.findByIdAndUpdate(content_id,{
		$set: {
			images: contentImages,
			files: contentFiles,
			post: req.body.blocks,
			dateCreated: Date.now(),
			persianDate,
			timeCreated
		}
	})
	if(req.session.contentImages && req.session.contentImages.length > 0) {
		req.session.contentImages.forEach(el=>{
			if(fs.existsSync(path.join(__dirname,'../public','uploads','images','temp',el))){
				fs.unlinkSync(path.join(__dirname,'../public','uploads','images','temp',el))
			}
		})
		req.session.contentImages = [];
	}
	if(req.session.contentFiles && req.session.contentFiles.length > 0) {
		req.session.contentFiles.forEach(el=>{
			if(fs.existsSync(path.join(__dirname,'../public','uploads','files','temp',el))){
				fs.unlinkSync(path.join(__dirname,'../public','uploads','files','temp',el))
			}
		})
		req.session.contentFiles = [];
	}
	res.status(200).json({
		content
	})
}
exports.getContentByTopic = async (req, res, next) => {
	if((await Content.find({})).length === 0){
		res.status(404).json({message: "هنوز هیچ محتوایی ثبت نشده است."})
		return
	}
	if(req.user.role === "content-creator"){
		if(req.query.q === ''||req.query.q ===null||!req.query.q) return next(new ERR("لطفا موضوع مورد نظر را وارد کنید.",400))
		let slug = slugify(`${req.query.q}`, {
			replacement: '-',
			locale: 'fa',
			remove: /[*+~.()'"!:@]/g
		});
		const user = await User
			.findById(req.user._id)
			.select("contents")
			.populate("contents", "slug")
		let content = slug;
		user.contents.forEach(el => {
			if (el.slug === slug) {
				content = el._id;
				return;
			}
		})
		if (slug === content) {
			return next(new ERR("شما محتوایی با این موضوع ندارید.", 404))
		}
		const result = await Content.findById(content)
		if (!result) return next(new ERR("نتیجه ای برای موضوع وارد شده وجود ندارد.", 404))
		res.status(200).json({
			status: "success",
			message: "محتوای شما پیدا شد.",
			result
		})
	} else if(req.user.role === "admin"){
		if(req.query.q === ''||req.query.q ===null||!req.query.q) return next(new ERR("لطفا موضوع مورد نظر را وارد کنید.",400))
		let slug = slugify(`${req.query.q}`, {
			replacement: '-',
			locale: 'fa',
			remove: /[*+~.()'"!:@]/g
		});
		const result = await Content.findOne({slug:slug})
		if (!result) return next(new ERR("نتیجه ای برای موضوع وارد شده وجود ندارد.", 404))
		res.status(200).json({
			status: "success",
			userRole: req.user.role,
			message: "محتوای شما پیدا شد.",
			result
		})
	}
}
exports.getContentById = async (req, res, next) => {
	if((await Content.find({})).length === 0){
		res.status(404).json({message: "هنوز هیچ محتوایی ثبت نشده است."})
		return
	}
	if(req.user.role === "content-creator"){
		if(req.query.q === ''||req.query.q ===null||!req.query.q) return next(new ERR("لطفا آیدی مورد نظر را وارد کنید.",400))
		let id = req.query.q.trim();
		const user = await User
			.findById(req.user._id)
			.select("contents")
		let contentId = 0;
		user.contents.forEach(el => {
			if (el.toString().trim() === id) {
				contentId = 1;
				return;
			}
		})
		const result = await Content.findById(id)
		if (contentId === 0) {
			return next(new ERR("شما محتوایی با این آیدی ندارید.", 404))
		} else if (!result) {
			return next(new ERR("نتیجه ای برای آیدی وارد شده وجود ندارد.", 404))
		}res.status(200).json({
			status: "success",
			message: "محتوای شما پیدا شد.",
			result
		})
	} else if(req.user.role === "admin"){
		if(req.query.q === ''||req.query.q ===null||!req.query.q) return next(new ERR("لطفا آیدی مورد نظر را وارد کنید.",400))
		let id = req.query.q.trim();
		const result = await Content.findById(id)
		if (!result) {
			return next(new ERR("نتیجه ای برای آیدی وارد شده وجود ندارد.", 404))
		}res.status(200).json({
			status: "success",
			userRole: req.user.role,
			message: "محتوای شما پیدا شد.",
			result
		})
	}
}
exports.getProductByTopic = async (req, res, next) => {
	if((await Product.find({})).length === 0){
		res.status(404).json({message: "هنوز هیچ محصولی ثبت نشده است."})
		return
	}
	if(req.user.role === "content-creator"){
		if(req.query.q === ''||req.query.q ===null||!req.query.q) return next(new ERR("لطفا نام محصول مورد نظر را وارد کنید.",400))

		let slug = slugify(`${req.query.q}`, {
			replacement: '-',
			locale: 'fa',
			remove: /[*+~.()'"!:@]/g
		});
		slug = slug.split("-").join(" ");
		const product = await Product.findOne({
			name:slug
		}).select("name explanation from image slug price discountPercentage discount");
		if(!product) return next(new ERR("محصولی با این نام پیدا نشد.",404))
		if(`${req.user._id}` !== `${product.from}`){
			return next(new ERR("شما محصولی با این نام ندارید.", 404))
		}
		res.status(200).json({
			status: "success",
			message: 'محصول پیدا شد.',
			result:product
		})
	}else if(req.user.role === "admin"){
		if(req.query.q === ''||req.query.q ===null||!req.query.q) {
			next(new ERR("لطفا نام محصول مورد نظر را وارد کنید.",400))
			return 
		}
		let slug = slugify(`${req.query.q}`, {
			replacement: '-',
			locale: 'fa',
			remove: /[*+~.()'"!:@]/g
		});
		slug = slug.split("-").join(" ");
		const product = await Product.findOne({
			name:slug
		}).select("name explanation from image slug price discountPercentage discount");
		res.status(200).json({
			status: "success",
			userRole: req.user.role,
			message: 'محصول پیدا شد.',
			result:product
		})
	}
}
exports.getProductById = async (req, res, next) => {
	if((await Product.find({})).length === 0){
		res.status(404).json({message: "هنوز هیچ محصولی ثبت نشده است."})
		return
	}
	if(req.user.role === "content-creator"){
		if(req.query.q === ''||req.query.q ===null||!req.query.q) return next(new ERR("لطفا آیدی محصول مورد نظر را وارد کنید.",400))

		const id = req.query.q;
		const product = await Product.findById(id)
		.select("name explanation from image slug price discountPercentage discount");
		if(!product) return next(new ERR("محصولی با این آیدی پیدا نشد.",404))
		if(`${req.user._id}` !== `${product.from}`){
			return next(new ERR("شما محصولی با این آیدی ندارید.", 404))
		}
		res.status(200).json({
			status: "success",
			message: 'محصول پیدا شد.',
			result:product
		})
	}else if(req.user.role === "admin"){
		if(req.query.q === ''||req.query.q ===null||!req.query.q) return next(new ERR("لطفا آیدی محصول مورد نظر را وارد کنید.",400))
		const id = req.query.q;
		const product = await Product.findById(id)
		.select("name explanation from image slug price discountPercentage discount");
		if(!product) return next(new ERR("محصولی با این آیدی پیدا نشد.",404))
		res.status(200).json({
			status: "success",
			userRole: req.user.role,
			message: 'محصول پیدا شد.',
			result:product
		})
	}
}
exports.getAllMyContents = async(req,res)=>{
	if(req.user.role === "content-creator"){
		const results = await User
			.findById(req.user._id)
			.populate("contents")
			.select("imageCover topic isPublished isConfirmed summary slug persianDate dateCreated")
		const numberOfAllContents = await User
			.findById(req.user._id)
			.populate("contents","slug topic")
		const uploadedOnes = await User
			.findById(req.user._id)
			.populate("contents","isPublished")
		const approvedOnes = await User
			.findById(req.user._id)
			.populate("contents","isConfirmed")
		
		let numberOfUploaded = 0;
		let numberOfApproved = 0;

		uploadedOnes.contents.forEach(el=>{
			if(el.isPublished === true){
				numberOfUploaded += 1;
			}
		})
		approvedOnes.contents.forEach(el=>{
			if(el.isConfirmed === true){
				numberOfApproved += 1;
			}
		})
		res.status(200).json({
			status:"success",
			results:results.contents,
			user: req.user,
			userRole: req.user.role,
			uploadedContents: numberOfUploaded,
			approvedContents: numberOfApproved,
			allResults: numberOfAllContents.contents.length
		})
	} else if(req.user.role==="admin"){
		const results = await Content
			.find({})
			.select("coverImage topic isPublished isConfirmed summary slug persianDate dateCreated")
		const numberOfAllContents = await Content
			.find({})
			.select("slug topic")
		const uploadedOnes = await Content
			.find({isPublished:true})
			.select("_id")
		const approvedOnes = await Content
			.find({isConfirmed:true})
			.select("_id")
		res.status(200).json({
			status:"success",
			results,
			userRole: req.user.role,
			uploadedContents: uploadedOnes.length,
			approvedContents: approvedOnes.length,
			allResults: numberOfAllContents.length
		})
	}
}
exports.getAllMyProducts = async(req,res)=>{
	if(req.user.role === "content-creator"){
		const results = await Product.find({
			from:req.user._id
		})
		.sort("dateCreated")
		.select("name image persianDate isPublished isConfirmed")
		
		const numberOfUploaded = await Product.find({
			from:req.user._id,
			isPublished: true
		})
		.sort("dateCreated")
		.select("_id")
		
		const numberOfApproved = await Product.find({
			from:req.user._id,
			isConfirmed: true
		})
		.sort("dateCreated")
		.select("_id")
		
		res.status(200).json({
			status:"success",
			results,
			uploadedProducts: numberOfUploaded.length,
			approvedProducts: numberOfApproved.length,
		})
	} else if(req.user.role === "admin"){
		const results = await Product.find()
		.sort("dateCreated")
		.select("name image persianDate isPublished isConfirmed")
		
		const numberOfUploaded = await Product.find({
			isPublished: true
		})
		.sort("dateCreated")
		.select("_id")
		
		const numberOfApproved = await Product.find({
			isConfirmed: true
		})
		.sort("dateCreated")
		.select("_id")
		
		res.status(200).json({
			status:"success",
			results,
			userRole: req.user.role,
			uploadedProducts: numberOfUploaded.length,
			approvedProducts: numberOfApproved.length,
		})
	}
}
exports.deleteTheContent = async(req,res,next)=>{
	if(req.user.role !== "admin" && req.user.role !== "content-creator") return next(new ERR("برای حذف محتوا شما باید درخواست خود را از طریق پنل کاربری ثبت کنید.",403))
	if (req.user.role === "content-creator") {
		await Message.create({
			name:"درخواست حذف محتوا",
			email: req.user.email,
			textMessage: req.params.id,
			type:"request"
		})
		res.status(200).send("<h2>.درخواست شما با موفقیت ارسال شد. نتیجه درخواست از طریق ایمیل به شما اطلاع داده خواهد شد</h2>");
		return;
	}
	const content = await Content.findById(req.params.id)
	if(!content){
		res.status(404).send(`
			<h1>محتوا قبلا حذف شده.</h1>
		`)
		return;
	}
	try{
		await Content.findByIdAndUpdate(req.params.id,{images: [],files: []})
		if(fs.existsSync(path.join(__dirname,'../public','uploads','images','content-cover-images',content.coverImage))){
			fs.unlinkSync(path.join(__dirname,'../public','uploads','images','content-cover-images',content.coverImage))		
		}
		content.images.forEach(el=>{
			if(fs.existsSync(path.join(__dirname,'../public','uploads','images','content',el))){
				fs.unlinkSync(path.join(__dirname,'../public','uploads','images','content',el))
			}
		})
		content.files.forEach(el=>{
			if(fs.existsSync(path.join(__dirname,'../public','uploads','files',el))){
				fs.unlinkSync(path.join(__dirname,'../public','uploads','files',el))
			}
		})
	} catch(err){
		if(err.message.includes("no such file")){
			res.status(500).send(`
				<h1>.این محتوا قبلا حذف شده</h1>
			`)
			return;
		}else{
			return next(err);
		}
	}
	await Content.findByIdAndDelete(req.params.id)
	res.status(200).send(`
	 	<h1>.محتوا با موفقیت حذف شد</h1>
	`)
}
exports.deleteTheProduct = async (req,res,next)=>{
	if(req.user.role !== "admin" && req.user.role !== "content-creator") return next(new ERR("برای حذف محصول شما باید درخواست خود را از طریق پنل کاربری ثبت کنید.",403))
	if (req.user.role === "content-creator") {
		await Message.create({
			name:"درخواست حذف محصول",
			email: req.user.email,
			textMessage: req.params.id,
			type:"request"
		})
		res.status(200).send("<h2>.درخواست شما با موفقیت ارسال شد. نتیجه درخواست از طریق ایمیل به شما اطلاع داده خواهد شد</h2>");
		return;
	}
	const product = await Product.findById(req.params.id)
	if(!product){
		res.status(404).send(`
			<h1>محصول قبلا حذف شده.</h1>
		`)
		return;
	}
	try{
		if(fs.existsSync(path.join(__dirname,'../public','uploads','images','products',product.image))){
			fs.unlinkSync(path.join(__dirname,'../public','uploads','images','products',product.image))
		}
	} catch(err){
		res.status(500).send(`
			<h1>.این محصول قبلا حذف شده</h1>
		`)
		return;
	}
	await Product.findByIdAndDelete(req.params.id)
	res.status(200).send(`
	 	<h1>.محصول با موفقیت حذف شد</h1>
	`)
}
exports.confirmTheContent= async(req,res)=>{
	const content = await Content.findById(req.params.id)
	if (!content) {
		res.status(404).send(`
			<h1>محتوا قبلا حذف شده.</h1>
		`)
		return;
	}
	await Content.findByIdAndUpdate(req.params.id,
		{$set:{isConfirmed: true}})
	res.status(200).send(`
		<h1>محتوا تأیید شد و در سایت قرار گرفت. </h1>
	`)
}
exports.confirmTheProduct = async(req,res)=>{
	const product = await Product.findById(req.params.id)
	if (!product) {
		res.status(404).send(`
			<h1>محتوا قبلا حذف شده.</h1>
		`)
		return;
	}
	await Product.findByIdAndUpdate(req.params.id,
		{$set:{isConfirmed: true}})
	res.status(200).send(`
		<h1>محصول تأیید شد و در سایت قرار گرفت. </h1>
	`)
}
exports.unConfirmTheContent= async(req,res)=>{
	const content = await Content.findById(req.params.id)
	if (!content) {
		res.status(404).send(`
			<h1>محتوا قبلا حذف شده.</h1>
		`)
		return;
	}
	await Content.findByIdAndUpdate(req.params.id,
		{$set:{isConfirmed: false}})
	res.status(200).send(`
		<h1>محتوا رد شد . </h1>
	`)
}
exports.unConfirmTheProduct = async(req,res)=>{
	const product = await Product.findById(req.params.id)
	if (!product) {
		res.status(404).send(`
			<h1>محتوا قبلا حذف شده.</h1>
		`)
		return;
	}
	await Product.findByIdAndUpdate(req.params.id,
		{$set:{isConfirmed: false}})
	res.status(200).send(`
		<h1>محتوا رد شد . </h1>
	`)
}
exports.uploadTheContent= async(req,res)=>{
	const content = await Content.findById(req.params.id)
	if (!content) {
		res.status(404).send(`
		<h1>محتوا رد شد . </h1>
		`)
		return;
	}
	await Content.findByIdAndUpdate(req.params.id,
		{$set:{isPublished: true}})
	res.status(200).send(`
		<h1>محتوا آپلود شد و بعد از تأیید بر روی وبسایت قرار خواهد گرفت . </h1>
	`)
}
exports.uploadTheProduct = async(req,res)=>{
	const product = await Product.findById(req.params.id)
	if (!product) {
		res.status(404).send(`
			<h1>محصول قبلا حذف شده.</h1>
		`)
		return;
	}
	await Product.findByIdAndUpdate(req.params.id,
		{$set:{isPublished: true}})
	res.status(200).send(`
		<h1>محتوا آپلود شد و بعد از تأیید بر روی وبسایت قرار خواهد گرفت . </h1>
	`)
}

exports.findContentToEdit = async(req,res) => {
	if(req.query.id) {
		const id = req.query.id;
		const content = await Content.findById(id).select("-post")
		if(!content) {
			res.status(404).json({
				message:'محتوایی با این آیدی یافت نشد.'
			})
			return
		}
		res.status(200).json({
			content
		})
	}else if(req.query.topic){
		const topic = req.query.topic;
		const content = await Content.findOne({topic}).select("-post")
		if(!content) {
			res.status(404).json({
				message:'محتوایی با این موضوع یافت نشد.'
			})
			return
		}
		res.status(200).json({
			content
		})
	} else {
		res.status(400).json({
			message: 'لطفا یکی از دو روش را برای جستجو انتخاب کنید.'
		})
	}
}
exports.editContent = async(req,res)=>{
	const {id,summary,topic,metaDescription,resource,keywords} = req.body;
	const content = await Content.findById(id)
	if(!content) return res.status(404).json({message: "مشکلی در اعمال تغییرات به وجود آمده لطفا دوباره امتحان کنید."})
	const oldImageName = content.coverImage
	req.body.topic = req.body.topic.split("  ").join(" ");
	let topicSlug = slugify(`${req.body.topic}`, {
		replacement: '-',
		locale: 'fa',
		remove: /[*+~.,()'"!:@]/g
	});
	const IsContentExist = await Content.find({
		slug: topicSlug
	});
	if (IsContentExist.length > 1) return res.status(500).json({message:"این موضوع قبلا استفاده شده لطفا موضوع دیگری انتخاب کنید"})
	const coverImageFile = req.files.image;
	if (coverImageFile.size > 1000000) return res.status(400).json({message:"تصاویر باید کمتر از 1 مگابایت حجم داشته باشند."})
	let coverImageName;
	let saveCoverImgTo;
	coverImageName = `image-cover-${Date.now()}.${coverImageFile.mimetype.split("/")[1]}`;
	saveCoverImgTo = path.join(__dirname, '../public', 'uploads', 'images', 'content-cover-images', coverImageName);
	
	const persianDate = dateJustNow()
  const timeCreated = timeJustNow()
	await Content.findByIdAndUpdate(id,{
		$set:{
			topic,
			resource, 
			coverImage: coverImageName,
			keywords: keywords.includes("،") ? keywords.split("،") : keywords.split(","),
			summary,
			metaDescription,
			slug:topicSlug,
			dateCreated: Date.now(),
			persianDate:persianDate,
			timeCreated: timeCreated
		}
	},{runValidators:true})
	await coverImageFile.mv(saveCoverImgTo)
	fs.unlinkSync(path.join(__dirname,"../public","uploads","images",'content-cover-images',oldImageName))
	res.status(200).json({
		message: "تغییرات با موفقیت اعمال شد."
	})
}
exports.findContentAndPreFill = async (req,res)=>{
	const id = req.query.id
	const content = await Content.findById(id).select("post dateCreated")
	if(!content) return res.status(404).json({message:"محتوایی با این آیدی پیدا نشد ، لطفا صفحه را رفرش و دوباره امتحان کنید."})
	res.status(200).json({
		content
	}) 
}
