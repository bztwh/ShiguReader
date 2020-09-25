// @flow
import React, { Component } from 'react';
import _ from "underscore";
import './style/Explorer.scss';
import PropTypes from 'prop-types';
import LoadingImage from './LoadingImage';
import Sender from './Sender';
import { Link } from 'react-router-dom';

const userConfig = require('@config/user-config');
import ErrorPage from './ErrorPage';
import FileChangeToolbar from './subcomponent/FileChangeToolbar';
import CenterSpinner from './subcomponent/CenterSpinner';
const util = require("@common/util");
const filesizeUitl = require('filesize');
const queryString = require('query-string');
import Pagination from './subcomponent/Pagination';
import SortHeader from './subcomponent/SortHeader';
import Breadcrumb from './subcomponent/Breadcrumb';
import FileCellTitle from './subcomponent/FileCellTitle';
import Checkbox from './subcomponent/Checkbox';
const nameParser = require('@name-parser');
const classNames = require('classnames');
const Constant = require("@common/constant");
const clientUtil = require("./clientUtil");
const { getDir, getBaseName, getPerPageItemNumber, isSearchInputTextTyping } = clientUtil;
const { isVideo, isCompress, isImage, isMusic } = util;
const sortUtil = require("../common/sortUtil");
const AdminUtil = require("./AdminUtil");

const { TIME_DOWN, 
        TIME_UP,
        BY_FOLDER_DOWN,
        BY_FOLDER_UP,
        FILENAME_UP,
        FILENAME_DOWN,
        FILE_SIZE_UP,
        FILE_SIZE_DOWN,
        AVG_PAGE_SIZE_UP,
        AVG_PAGE_SIZE_DOWN,
        PAGE_NUMBER_UP,
        PAGE_NUMBER_DOWN,
        SORT_RANDOMLY } =  Constant;

const { MODE_TAG,
        MODE_HOME,
        MODE_AUTHOR,
        MODE_SEARCH,
        MODE_EXPLORER} = Constant;

const GOOD_STANDARD = 2;

function parse(str){
    return nameParser.parse(getBaseName(str));
}

export default class ExplorerPage extends Component {
    constructor(prop) {
        super(prop);
        this.state = this.getInitState();
        this.failedTimes = 0;
        this.files = [];
    }

    getNumPerPage(){
        return this.state.noThumbnail? 40 :  getPerPageItemNumber();
    }

    getInitState(reset){
        const parsed = reset? {} : queryString.parse(location.hash);
        const pageIndex = parseInt(parsed.pageIndex) || 1;
        const isRecursive = !!(parsed.isRecursive === "true");
        const sortOrder = parsed.sortOrder || TIME_DOWN;
        const showVideo = !!(parsed.showVideo === "true");
        
        return {
            anchorSideMenu: false,
            pageIndex,
            isRecursive,
            sortOrder,
            showVideo,
            filterByGoodAuthorName: parsed.filterByGoodAuthorName === "true",
            filterByFirstTime: parsed.filterByFirstTime === "true",
            filterByHasMusic: parsed.filterByHasMusic === "true",
            filterByOversizeImage: parsed.filterByOversizeImage === "true",
            filterByGuess: parsed.filterByGuess === "true",
            filterText: parsed.filterText || "",
            noThumbnail: parsed.noThumbnail === "true"
        }
    }

    setStateAndSetHash(state, callback){
        const obj = Object.assign({}, this.state, state);

        const obj2 = {};
        ["pageIndex",
        "isRecursive", 
        "sortOrder", 
        "showVideo", 
        "filterByGoodAuthorName",
        "filterByFirstTime",
        "filterByHasMusic",
        "filterByOversizeImage",
        "filterByGuess",
        "filterText",
        "noThumbnail"].forEach(key => {
          obj2[key] = obj[key];
        })
        location.hash = queryString.stringify(obj2);
        this.setState(state, callback);
    }

    handlePageChange(index){
        if(window.event && window.event.ctrlKey){
            return;
        }
        this.setStateAndSetHash({ pageIndex: index});
    }

    next(){
        if(this.pagination && this.pagination.hasNext()){
            let next = this.state.pageIndex+1;
            this.handlePageChange(next);
        }
    }

    prev(){
        if(this.pagination && this.pagination.hasPrev()){
            let next = this.state.pageIndex-1;
            this.handlePageChange(next);
        }
    }

    getPathFromQuery(props){
        const _props = props || this.props;
        return queryString.parse(_props.location.search)["p"] ||  "";
    }

    getSearchTextFromQuery(props){
        // https://en.wikipedia.org/wiki/URL
        // e.g ?s=apple
        const _props = props || this.props;
        if(this.getMode(_props) === MODE_SEARCH){
            let str =  _props.location.search || _props.location.pathname;
            str = str.replace("/search/?", "")
            return queryString.parse(str)["s"] ||  "";
        }
    }

    getAuthorFromQuery(props){
        const _props = props || this.props;
        return queryString.parse(_props.location.search)["a"] || "";
    }

    getTagFromQuery(props){
        const _props = props || this.props;
        return queryString.parse(_props.location.search)["t"] ||  "";
    }

    getTextFromQuery(props) {
        const _props = props || this.props;
        return this.getTagFromQuery(_props) || 
               this.getAuthorFromQuery(_props)||
               this.getSearchTextFromQuery(_props) ||
               this.getPathFromQuery(_props);
    }

    getMode(props){
        const _props = props || this.props;
        const pathname = _props.location.pathname;
        if(pathname.includes("/tag/")){
            return MODE_TAG;
        } else if(pathname.includes("/author/")) {
            return MODE_AUTHOR;
        } else if(pathname.includes("/explorer/")) {
            return MODE_EXPLORER;
        } else if(pathname.includes("/search/")) {
            return MODE_SEARCH;
        } else {
            return MODE_HOME;
        }
    }

    componentWillReceiveProps(nextProps){
        if(_.isString(nextProps.filterText) && nextProps.filterText !== this.state.filterText){
            this.handlePageChange(1);

            this.setState({
                filterText: nextProps.filterText
            })
        }
    }

    requestHomePagePathes() {
        Sender.post("/api/homePagePath", { }, res => {
            this.handleRes(res);
        });
    }
    

    askServer(){
        if(this.getMode() === MODE_HOME){
            this.requestHomePagePathes();
        } else{
            const hash = this.getTextFromQuery();
            if (hash && this.loadedHash !== hash && this.failedTimes < 3) {
                if(this.getMode() === MODE_TAG){
                    this.requestSearch();
                } else if(this.getMode() === MODE_AUTHOR){
                    this.requestSearch();
                } else if (this.getMode() === MODE_SEARCH){
                    this.requestTextSearch();
                } else {
                    this.requestLsDir();
                }
            }
        }
    }

    componentDidMount() {
        this.askServer();

        this.bindUserInteraction();

        Sender.get('/api/getGoodAuthorNames', res =>{
            this.setState({
                goodAuthors: res.goodAuthors,
                otherAuthors: res.otherAuthors
            })
        });
    }

    bindUserInteraction(){
        document.addEventListener('keydown', this.handleKeyDown.bind(this));
    }

    componentWillUnmount(){
        document.removeEventListener("keydown", this.handleKeyDown.bind(this));
    }
    
    componentDidUpdate(prevProps, prevState) {
        //when path changes, does not show previous path's content 
        const prevMode = this.getMode(prevProps);
        const prevHash = this.getTextFromQuery(prevProps);
        const differentMode = this.getMode() !== prevMode;
        const sameMode = !differentMode;
        const pathChanged = !!(sameMode && this.getTextFromQuery() !== prevHash );
        if(differentMode || pathChanged ){
            this.loadedHash = "";
            this.videoFiles = []
            this.files = [];
            this.dirs = [];
            this.tag = "";
            this.author = "";
            this.fileInfos = {};
            this.thumbnails = {};
            this.fakeZips = {};
            this.fakeZipInfo = {};
            this.res = null;
            //init state
            this.setStateAndSetHash(this.getInitState(true));
            this.askServer();
        }
    }

    handleRes(res){
        if (!res.failed) {
            let {dirs, tag, author, fileInfos, thumbnails, zipInfo, fakeZips, fakeZipInfo,  guessIfUserLike} = res;
            this.loadedHash = this.getTextFromQuery();
            this.fileInfos = fileInfos || {};
            const files = _.keys(this.fileInfos) || [];
            this.videoFiles = files.filter(isVideo);
            this.files = files.filter(isCompress);
            this.dirs = dirs || [];
            this.tag = tag || "";
            this.author = author || "";
            this.thumbnails = thumbnails || {};
            this.zipInfo = zipInfo || {};
            this.guessIfUserLike = guessIfUserLike || {};
            this.fakeZips = fakeZips || {};
            this.fakeZipInfo = fakeZipInfo || {};
            this.res = res;

            this.allfileInfos = _.extend({}, this.fileInfos, this.fakeZipInfo);

            if(this.videoFiles.length > 0){
                this.setStateAndSetHash({
                    showVideo: true
                });
            }

            //check pageindex
            const availableFiles = this.getFileInPage(this.getFilteredFiles());

            if(availableFiles.length === 0){
                //this will set state
                this.handlePageChange(1);
            }else{
                this.forceUpdate();
            }
        }else{
            this.res = res;
            this.failedTimes++;
            this.forceUpdate();
        }
    }

    requestTextSearch() {
        Sender.post("/api/search", { text: this.getSearchTextFromQuery(),  mode: this.getMode()}, res => {
            this.handleRes(res);
        });
    }

    handleKeyDown(event) {
        //this cause input wont work 
        if(isSearchInputTextTyping()){
            return;
        }

        const key = event.key.toLowerCase();
        if (key === "arrowright" || key === "d" || key === "l") {
          this.next();
          event.preventDefault();
        } else if (key === "arrowleft" || key === "a" || key === "j") {
          this.prev();
          event.preventDefault();
        }
    }

    requestSearch() {
        Sender.post("/api/search", { text: this.getTextFromQuery(),
                                    mode: this.getMode()}, res => {
            this.handleRes(res);
        });
    }
    
    requestLsDir() {
        Sender.lsDir({ dir: this.getTextFromQuery(), isRecursive: this.state.isRecursive }, res => {
            this.handleRes(res);
        });
    }

    //comes from file db.
    //may not be reliable
    getFileSize(e){
        if(this.fakeZipInfo[e]){
            return this.fakeZipInfo[e].size;
        }
        return (this.fileInfos[e] && this.fileInfos[e].size) || 0;
    }

    getAllFileSize(files){
        let totalSize = 0;
        files.forEach(e => {
            totalSize += this.getFileSize(e);
        });
        return totalSize;
    }

    getPageNum(fp){
        if(this.fakeZips[fp]){
            return this.fakeZips[fp].filter(isImage).length;
        }
        return +(this.zipInfo[fp] && this.zipInfo[fp].pageNum) || 0;
    }

    getAllFilePageNum(filteredFiles){
        let count = 0;
        filteredFiles.forEach(e => {
            count += this.getPageNum(e);
        });
        return count;
    }

    hasZipInfo(fp){
       return !!this.zipInfo[fp];
    }

    //comes from zipInfo libray, may not be reliable
    //because sometimes, filename dont chane but the size change 
    getTotalImgSize(fp){
        if(this.fakeZips[fp]){
            return this.fakeZipInfo[fp].imgSize;
        }
       return +(this.zipInfo[fp] && this.zipInfo[fp].totalImgSize) || 0;
    }

    //may not be reliable
    getPageAvgSize(e, forDisplay){
        const pageNum = this.getPageNum(e);
        if(pageNum === 0){
            //one for display
            //one for sort 
            return forDisplay? 0 : -Infinity;
        }

        //choose the min
        //but can not be 0
        let total;

        if(this.getFileSize(e) === 0){
            total = this.getTotalImgSize(e);
        }else{
            total = Math.min(this.getFileSize(e), this.getTotalImgSize(e))
        }

        return total/pageNum;
    }

    getMusicNum(fp){
        if(this.fakeZips[fp]){
            return this.fakeZips[fp].filter(isMusic).length;
        }
        return +(this.zipInfo[fp] && this.zipInfo[fp].musicNum) || 0;
    }
    
    getFilteredFiles(){
        let files = this.files || [];
        files = files.concat(_.keys(this.fakeZips))
        const goodSet = this.state.goodAuthors;
        const otherSet = this.state.otherAuthors;
        const guessIfUserLike = this.guessIfUserLike;
        const {filterByGoodAuthorName, filterByOversizeImage, filterByGuess, filterByFirstTime, filterByHasMusic} = this.state;

        if(filterByGoodAuthorName && goodSet && otherSet){
            files = files.filter(e => {
                const temp = parse(e);
                if(temp && temp.author && goodSet[temp.author] && goodSet[temp.author] > GOOD_STANDARD){
                    return e;
                }
            })
        }

        if(filterByGuess){
            files = files.filter(e => {
               return guessIfUserLike[e]
            });
        }

        if(filterByOversizeImage){
           files = files.filter(e => {
               if(this.zipInfo[e]){
                   if(this.getPageAvgSize(e)/1024/1024 > userConfig.oversized_image_size){
                       return e;
                   }
               }
           })
        }

        if(filterByFirstTime && goodSet && otherSet){
            files = files.filter(e => {
                const temp = parse(e);
                if(temp && temp.author && ((goodSet[temp.author]||0) + (otherSet[temp.author]||0)) <= 1){
                    
                    return e;
                }
            })
        }

        if(filterByHasMusic){
            files = files.filter(e => {
                if(this.zipInfo[e]){
                    const musicNum =  this.zipInfo[e].musicNum || 0;
                    if(musicNum > 0){
                        return e;
                    }
                }
            })
        }

        const filterText = _.isString(this.state.filterText) && this.state.filterText.toLowerCase();
        if(filterText){
            return files.filter(e => {
                return e.toLowerCase().indexOf(filterText) > -1;
            });
        }else{
            return files;
        }
    }

    getFilteredVideos(){
        if(!this.state.showVideo){
            return [];
        }

        const { filterByGoodAuthorName, filterByOversizeImage, filterByGuess, filterByFirstTime, filterByHasMusic} = this.state;
        let videoFiles;
        if(filterByGoodAuthorName || filterByOversizeImage || filterByGuess || filterByFirstTime || filterByHasMusic){
            videoFiles = [];
        }else{
            videoFiles =  this.videoFiles || []
        }

        const filterText = this.state.filterText && this.state.filterText.toLowerCase();
        if(filterText){
            return videoFiles.filter(e => {
                return e.toLowerCase().indexOf(filterText) > -1;
            });
        }else{
            return videoFiles;
        }
    }

    getFileInPage(files){
        return files.slice((this.state.pageIndex-1) * this.getNumPerPage(), (this.state.pageIndex) * this.getNumPerPage());
    }

    sortFiles(files, sortOrder){
        //-------sort algo
        const byFn = (a, b) => {
            const ap = getBaseName(a);
            const bp = getBaseName(b);
            return ap.localeCompare(bp);
        }

        if (sortOrder.includes(SORT_RANDOMLY)){
            files = _.shuffle(files);
        }else if(sortOrder  === FILENAME_UP || sortOrder === FILENAME_DOWN){
            files.sort((a, b) => {
                return byFn(a, b);
            });

            if(sortOrder === FILENAME_DOWN){
                files.reverse();
            }
        }else if(sortOrder === BY_FOLDER_UP || sortOrder === BY_FOLDER_DOWN){
            files = _.sortBy(files, e => {
                const dir =  getDir(e);
                return dir;
            });

            if(sortOrder === BY_FOLDER_DOWN){
                files.reverse();
            }
        }else if (sortOrder === TIME_DOWN ||  sortOrder === TIME_UP){
            const ifFromEarly = sortOrder === TIME_UP;
            const ifOnlyBymTime = this.getMode() === MODE_EXPLORER;
            files = sortUtil.sort_file_by_time(files, this.allfileInfos, getBaseName, ifFromEarly, ifOnlyBymTime);
        } else if (sortOrder === FILE_SIZE_DOWN || sortOrder === FILE_SIZE_UP){
            files = _.sortBy(files, e => {
                const size =  this.getFileSize(e);
                return sortOrder.includes("_up")? size: -size;
            });
        } else if (sortOrder === AVG_PAGE_SIZE_UP || sortOrder === AVG_PAGE_SIZE_DOWN){
            files = _.sortBy(files, e => {
                const size =  this.getPageAvgSize(e);
                return sortOrder.includes("_up")? size: -size;
            });
        } else if (sortOrder === PAGE_NUMBER_UP || sortOrder === PAGE_NUMBER_DOWN){
            files = _.sortBy(files, e => {
                const size =  this.getPageNum(e);
                return sortOrder.includes("_up")? size: -size;
            });
        }

        return files;
    }

    getOneLineListItem(icon, fileName, filePath){
        return (
        <li className="explorer-one-line-list-item" key={fileName} title={filePath}>
        {icon}
        <span className="explorer-one-line-list-item-text">{fileName}</span>
        </li>);
    }

    renderFileList(filteredFiles, filteredVideos) {
        const { sortOrder } = this.state;
        let dirs = this.dirs||[];
        let videos = filteredVideos;
        let files = filteredFiles;

        try {
            files = this.sortFiles(files, sortOrder);
            videos = this.sortFiles(videos, sortOrder);
        }catch(e){
            console.error(e);
        }
        
        if (_.isEmpty(dirs) && _.isEmpty(files) && _.isEmpty(videos)) {
            if(!this.res){
                return (<CenterSpinner text={this.getTextFromQuery()}/>);
            }else{
                const str = this.getMode() === MODE_EXPLORER? "Empty Folder" : "Empty Result";
                return (<div className="one-book-nothing-available">
                            <div className="alert alert-secondary" role="alert">{str}</div>
                        </div>);
            }
        } 
        
        const dirItems = dirs.map((item) =>  {
            const toUrl = clientUtil.getExplorerLink(item);
            const text = this.getMode() === MODE_HOME ? item: getBaseName(item);
            const result =  this.getOneLineListItem(<i className="far fa-folder"></i>, text, item);
            return  <Link to={toUrl}  key={item}>{result}</Link>;
        });

        let videoItems = videos.map((item) =>  {
            const toUrl = clientUtil.getVideoPlayerLink(item);
            const text = getBaseName(item);
            const result = this.getOneLineListItem(<i className="far fa-file-video"></i>, text, item);
            return  <Link target="_blank" to={toUrl}  key={item}>{result}</Link>;
        });

        //! !todo if the file is already an image file
        files = this.getFileInPage(files);

        //better tooltip to show file size 
        //and tag
        let breadcrumbCount = 0;
        const zipfileItems = files.map((item, index) => {
            const text = getBaseName(item);
            const toUrl =  clientUtil.getOneBookLink(item);

            const fileSize = this.getFileSize(item);
            const fileSizeStr = fileSize && filesizeUitl(fileSize, {base: 2});

            const avgSize = this.getPageAvgSize(item, "for-dispaly");
            const avgSizeStr = avgSize && filesizeUitl(avgSize, {base: 2});

            let seperator;
 
            if((sortOrder === BY_FOLDER_DOWN || sortOrder === BY_FOLDER_UP  ) &&
                (this.getMode() === MODE_AUTHOR || this.getMode() === MODE_TAG || this.getMode() === MODE_SEARCH )){
                const prev = files[index - 1];
                if(!prev || getDir(prev) !== getDir(item)){
                    seperator = (<div className="col-12"  key={item+"---seperator"}> 
                                 <Breadcrumb  path={getDir(item)} className={breadcrumbCount > 0? "not-first-breadcrumb folder-seperator": "folder-seperator" }/>
                                 </div>);
                    breadcrumbCount++;
                }
            }

            let zipItem;

            if(this.state.noThumbnail){
                zipItem = (<Link to={toUrl}  key={item} className={""}>
                        {this.getOneLineListItem(<i className="fas fa-book"></i>, text, item)}
                        </Link>)
            }else{

                const hasZipInfo = this.hasZipInfo(item);
                const musicNum = this.getMusicNum(item);
                const isFakeZip = !!this.fakeZips[item];
                const hasMusic = musicNum > 0;
                const pageNum = this.getPageNum(item);

                const fileInfoRowCn = classNames("file-info-row", {
                    "less-padding": hasMusic
                })

                let thumbnailurl;
                if(isFakeZip){
                    //todo sort and choose
                    const _imgs = this.fakeZips[item].filter(isImage);
                    clientUtil.sortFileNames(_imgs)
                    const tp = _imgs[0];
                    thumbnailurl = clientUtil.getDownloadLink(tp);
                }else{
                    thumbnailurl = this.thumbnails[item];
                }

                zipItem = (
                <div key={item} className={"col-sm-6 col-md-4 col-lg-3 file-out-cell"}>
                    <div className="file-cell">
                        <Link  target="_blank" to={toUrl}  key={item} className={"file-cell-inner"}>
                            <FileCellTitle str={text}/>
                            <LoadingImage 
                                    asSimpleImage={isFakeZip}
                                    isThumbnail 
                                    className={"file-cell-thumbnail"} 
                                    title={item} fileName={item}   
                                    url={thumbnailurl}
                                    onReceiveUrl={url => {this.thumbnails[item] = url;}} 
                                    />
                        </Link>
                        <div className={fileInfoRowCn}>
                            <span title="file size">{fileSizeStr}</span>
                            {(hasZipInfo || isFakeZip)  &&  <span>{`${pageNum} pages`}</span>}
                            {hasMusic  &&  <span>{`${musicNum} songs`}</span>}
                            <span title="average img size"> {avgSizeStr} </span>
                        </div>
                        <FileChangeToolbar isFolder={isFakeZip} hasMusic={hasMusic} className="explorer-file-change-toolbar" file={item} />
                    </div>
                </div>);
            }
            
            return (<React.Fragment  key={item}>
                    {seperator}
                    {zipItem}
                    </React.Fragment>);
        });

        const rowCn = this.state.noThumbnail? "file-list" : "row";

        return (
            <div className={"explorer-container"}>
                <ul className={"dir-list container"}>
                    {dirItems}
                </ul>
                <ul className={"dir-list container"}>
                    {videoItems}
                </ul>
                {this.renderPagination(filteredFiles, filteredVideos)}
                {this.renderSortHeader()}
                <div className={"file-grid container"}>
                    <div className={rowCn}>
                        {zipfileItems}
                    </div>
                </div>
            </div>
        );
    }
    
    isFailedLoading(){
        return this.res && this.res.failed;
    }

    toggleRecursively(){
        this.videoFiles = []
        this.files = [];
        this.dirs = [];
        this.res = null;

        this.setStateAndSetHash({
            pageIndex: 1,
            isRecursive: !this.state.isRecursive
        }, ()=>{
            this.failedTimes = 0;
            this.requestLsDir();
        })
    }

    toggleThumbNail(){
        this.setStateAndSetHash({
            noThumbnail: !this.state.noThumbnail,
            pageIndex: 1
        })
    }

    toggleShowVideo(){
        this.setStateAndSetHash({
            showVideo: !this.state.showVideo
        })
    }

    renderToggleThumbNailButton(){
        const text2 = this.state.noThumbnail? "Show Thumbnail" : "File Name Only";
        return (
           <span key="thumbnail-button" className="thumbnail-button exp-top-button" onClick={this.toggleThumbNail.bind(this)}>
                <span className="fas fa-book" /> <span>{text2} </span> 
            </span>
        );
    }

    renderShowVideoButton(){
        const text2 = this.state.showVideo? "hide video" : "show video";
        return (
            <span className="show-video-button exp-top-button" onClick={this.toggleShowVideo.bind(this)}> 
            <span className="fas fa-video" />
            <span> {text2} </span>
            </span>
        );
    }

    renderLevelButton(){
     const text = this.state.isRecursive? "Show only one level" : "Show subfolder's files";
     return (
        <span className="recursive-button exp-top-button" onClick={this.toggleRecursively.bind(this)}> 
        <span className="fas fa-glasses" />
        <span> {text} </span>
        </span>
     );
    }

    renderToggleMenuButton(){
        const text = "toggle side menu"
        return (
           <span key="toggle-side-menu-button" className="toggle-side-menu-button exp-top-button" onClick={this.toggleSideMenu.bind(this)}> 
           <span className="fas fa-ellipsis-h" />
           <span> {text} </span>
           </span>
        );
    }

    renderChartButton(){
        const table = {}
        table[MODE_AUTHOR] = "/chart/?a=";
        table[MODE_EXPLORER] = "/chart/?p=";
        table[MODE_SEARCH] = "/chart/?s=";
        table[MODE_TAG] = "/chart/?t=";
        let link = table[this.getMode()]+this.getTextFromQuery();
        if(this.state.isRecursive){
            link += "&isRecursive=true"
        }

        return (<Link target="_blank" className="exp-top-button" to={link}>  
                        <span className="fas fa-chart-line" /> 
                        <span> chart </span>
                </Link>)
    }

    renderPregenerateButton(){
        if(this.getMode() === MODE_EXPLORER){
            const text = "generate thumbnail"
            return (
               <span key="thumbnail-button" className="thumbnail-button exp-top-button" onClick={()=>AdminUtil.askPregenerate(this.getPathFromQuery())}> 
               <span className="fas fa-tools" />
               <span> {text} </span>
               </span>
            );
        }
    }

    renderFileCount(filteredFiles, filteredVideos){
        const totalZipSize = this.getAllFileSize(filteredFiles);
        const totalVideoSize = this.getAllFileSize(filteredVideos);
        const totalSize = totalZipSize + totalVideoSize;
        const title = `${filesizeUitl(totalZipSize,2)} zips and ${filesizeUitl(totalVideoSize,2)} videos`
        const totalPageNum = this.getAllFilePageNum(filteredFiles);
        return (
            <React.Fragment>
            <div className="file-count col-6 col-md-4"><i className="fas fa-file-archive"/>{filteredFiles.length + " compressed files"} </div>
            <div className="file-count col-6 col-md-4"><i className="fas fa-paperclip"/>{totalPageNum + " pages"} </div>
            <div className="file-count col-6 col-md-4"><i className="fas fa-film"/>{filteredVideos.length + " video files"} </div>
            <div className="file-count col-6 col-md-4" title={title}><i className="fas fa-hdd"/>{filesizeUitl(totalSize, {base: 2})} </div>
            </React.Fragment>
        );
    }

    getExplorerToolbar(filteredFiles, filteredVideos){
        const mode = this.getMode();
        if(mode === MODE_HOME){
            return;
        }

        const isExplorer = mode === MODE_EXPLORER && this.getPathFromQuery();
        const isTag = mode === MODE_TAG;
        const isAuthor = mode == MODE_AUTHOR;
        const url =  clientUtil.getSearhLink(this.getTextFromQuery());

        let topButtons = (
        <div className="top-button-gropus row">
                {this.renderFileCount(filteredFiles, filteredVideos)}
                {filteredFiles.length > 0 && 
                    <div className="col-6 col-md-4"> {this.renderToggleThumbNailButton()} </div>}
                {isExplorer && 
                    <div className="col-6 col-md-4"> {this.renderLevelButton()} </div> }
                {filteredVideos.length > 0 && 
                    <div className="col-6 col-md-4"> {this.renderShowVideoButton()} </div>}
                <div className="col-6 col-md-4 " > {this.renderToggleMenuButton()} </div>  
                <div className="col-6 col-md-4"> {this.renderChartButton()} </div>
                {isExplorer && 
                    <div className="col-6 col-md-4"> {this.renderPregenerateButton()} </div>}
                {
                    (isTag || isAuthor) && 
                    <div className="col-6 col-md-4"> 
                       <Link className="exp-top-button"  target="_blank" to={url} >
                            <span className="fab fa-searchengin" /> 
                            <span>Search by Text </span>
                        </Link>
                    </div>
                }
        </div>);

        const breadcrumb = isExplorer && ( <div className="row">
        <Breadcrumb path={this.getPathFromQuery()} className="col-12" />
        </div>);

        return (<div className="container explorer-top-bar-container">
                    {breadcrumb}
                    {topButtons}
                </div>);
    }

    getTitle(){
        const mode = this.getMode();

        if(mode === MODE_HOME){
            return "";
        }else if(this.tag && mode === MODE_TAG) {
            return "Tag: " + this.tag;
        } else if(this.author && mode === MODE_AUTHOR) {
            return "Author: " + this.author;
        } else if(mode === MODE_SEARCH){
            return "Search Result: " + this.getTextFromQuery();
        }
    }

    getLinkToEhentai(){
        let searchable = this.tag || this.author;
        const isSearchMode = this.getMode() === MODE_SEARCH;
        if(isSearchMode){
            searchable = this.getTextFromQuery();
        }

        if(searchable){
            const link = "https://exhentai.org/?f_search=" + searchable;
            const title = "Search '"  + searchable +  "' in Exhentai";

            let btn;
            if(this.getMode() === MODE_AUTHOR || this.getMode() === MODE_TAG || this.getMode() === MODE_SEARCH){
                btn = [this.renderToggleThumbNailButton(), this.renderToggleMenuButton()] ;
            }

            return (<center className={"location-title"}>
                        <a className="explorer-external-link" target="_blank" href={link} title={title}>{this.getTitle()} </a>
                    </center>);
        } 
    }

    renderPagination(filteredFiles, filteredVideos){
        if(this.getMode() === MODE_HOME){
            return;
        }
        const fileLength = filteredFiles.length;
        return (<div className="pagination-container">
                            <Pagination ref={ref => this.pagination = ref}
                            currentPage={this.state.pageIndex}  
                            itemPerPage={this.getNumPerPage()}
                            totalItemNum={fileLength} 
                            onChange={this.handlePageChange.bind(this)} 
                            /></div>);
    }

    setWebTitle(){
        const mode = this.getMode();
        if(mode === MODE_HOME){
            document.title = "ShiguReader";
        }else{
            document.title = this.getTextFromQuery()|| "ShiguReader";
        }
    }

    onSortChange(e){
        this.setStateAndSetHash({sortOrder: e})
    }

    toggleSideMenu(){
        this.setState({anchorSideMenu: !this.state.anchorSideMenu})
    }

    setFilterText(text){
        this.setStateAndSetHash({filterText: text, pageIndex: 1});
    }

    toggleGoodAuthor(){
        this.setStateAndSetHash({
            filterByGoodAuthorName: !this.state.filterByGoodAuthorName
        });
    };

    toggleOversizeImage(){
        this.setStateAndSetHash({
            filterByOversizeImage: !this.state.filterByOversizeImage
        });
    };

    toggleGuess(){
        this.setStateAndSetHash({
            filterByGuess: !this.state.filterByGuess
        });
    };

    toggleFirstTime(){
        this.setStateAndSetHash({
            filterByFirstTime: !this.state.filterByFirstTime
        });
    }

    toggleHasMusic(){
        this.setStateAndSetHash({
            filterByHasMusic: !this.state.filterByHasMusic
        });
    }

    renderSideMenu(filteredFiles, filteredVideos){
        const tag2Freq = {};
        filteredFiles.forEach(e => {
            const result = parse(e);
            let tags = (result && result.tags)||[];

            tags.forEach(t => {
                if(t.length > 1){
                    tag2Freq[t] = tag2Freq[t] || 0;
                    tag2Freq[t]++;
                }
            })
        });

        let tags = _.keys(tag2Freq);

       tags.sort((a, b) => {
            return tag2Freq[b] - tag2Freq[a];
        })

        const tagInfos = tags.slice(0, 30).map(t => {
            return (<div className="side-menu-single-tag col-3" onClick={() => this.setFilterText(t)} key={t}>
                        {t}<span>({tag2Freq[t]})</span> 
                    </div>);
        });


        const showAll = (
        <div className="side-menu-single-tag col-3" onClick={() => this.setFilterText("")} key={"side-menu-single-tag-all"}>
            All
        </div>);

        tagInfos.unshift(showAll);
        const tagContainer = (<div className="exp-tag-container row">{tagInfos} </div>);

        if(this.getMode() !== MODE_HOME){
            const cn = classNames("side-menu container", {
                anchorSideMenu: this.state.anchorSideMenu
            });

       
            return (<div className={cn}>
                    <div className="side-menu-radio-title"> Special Filter </div>
                    {this.renderSpecialFilter()}
                    {tagContainer}
                </div>)
        }
    }

    renderSortHeader(){
        if(this.getMode() === MODE_HOME){
            return;
        }

        let sortOptions = Constant.SORT_OPTIONS;

        if(this.getMode() !== MODE_EXPLORER ){
            sortOptions = sortOptions.concat("by folder name");
        }

        return (<div className="sort-header-container container"> 
            <SortHeader  options={sortOptions} value={this.state.sortOrder} onChange={this.onSortChange.bind(this)} />
            </div>);
    }

    renderSpecialFilter(){
        //no one pay me, I am not going to improve the ui
        let checkbox;
        if(this.state.goodAuthors){
            checkbox = (<Checkbox  onChange={this.toggleGoodAuthor.bind(this)} 
                                    checked={this.state.filterByGoodAuthorName} 
                                  title={`need to found more than ${GOOD_STANDARD} times in good folder`}>
                             By good_folder_root 
                        </Checkbox> );       
        }   

        const st5 = `Guess you like` ;
        let checkbox5 = (<Checkbox  onChange={this.toggleGuess.bind(this)} checked={this.state.filterByGuess}>
                                   {st5}   
                            </Checkbox> ); 

        const st2 = `image size bigger than ${userConfig.oversized_image_size} MB` ;
        let checkbox2 = (<Checkbox  onChange={this.toggleOversizeImage.bind(this)} checked={this.state.filterByOversizeImage}>
                                   {st2}   
                            </Checkbox> ); 

        const st3 = `first time` ;
        let checkbox3 = (<Checkbox  onChange={this.toggleFirstTime.bind(this)} checked={this.state.filterByFirstTime}>
                                   {st3}   
                            </Checkbox> ); 

        const st4 = `has music` ;
        let checkbox4 = (<Checkbox  onChange={this.toggleHasMusic.bind(this)} checked={this.state.filterByHasMusic}>
                                {st4}   
                            </Checkbox> ); 
        return (
        <div className="speical-checkbox-container">
            {checkbox}
            {checkbox5}
            {checkbox2}
            {checkbox3}
            {checkbox4}
        </div>);
    }

    render() {
        this.setWebTitle();

        if (this.isFailedLoading()) {
            return <ErrorPage res={this.res.res}/>;
        }

        const filteredFiles = this.getFilteredFiles();
        const filteredVideos =  this.getFilteredVideos();

        const cn = classNames("explorer-container-out", this.getMode().replace(" ", "_"));

        return (<div className={cn} >
            {this.getLinkToEhentai()}
            {this.getExplorerToolbar(filteredFiles, filteredVideos)}
            {this.renderSideMenu(filteredFiles, filteredVideos)}
            {this.renderFileList(filteredFiles, filteredVideos)}
            {this.renderPagination(filteredFiles, filteredVideos)}
            </div>
        );
    }
}

ExplorerPage.propTypes = {
    dirs: PropTypes.array,
    files: PropTypes.array,
    openBookFunc: PropTypes.func,
    openDirFunc: PropTypes.func,
    filterText: PropTypes.string
};
