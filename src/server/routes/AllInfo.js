
const express = require('express');
const router = express.Router();
const serverUtil = require("../serverUtil");
const db = require("../models/db");
const { getAllFilePathes } = db;
const { getThumbnails } = serverUtil.common;
const util = global.requireUtil();
const { isDisplayableInExplorer } = util;

router.post('/api/tagInfo', async (req, res) => {
    // const needThumbnail = req.body && req.body.needThumbnail;
    const sqldb = db.getSQLDB();

    //inner joiner then group by
    let sql = `SELECT a.filePath, max(a.sTime) as maxTime , b.tag, COUNT(b.tag) as count, b.type, b.subtype ` 
    + `FROM (SELECT * FROM tag_table WHERE type = 'author' ) AS b LEFT JOIN `
    + `(SELECT * FROM file_table where isCompress = true ) AS a `
    + `ON a.filePath = b.filePath GROUP BY tag HAVING a.sTime = maxTime AND count > 1 ORDER BY count DESC`;

    //todo: sort by  a.sTime DESC
    let author_rows = await sqldb.allSync(sql);
    author_rows.forEach(row => {
        row.thumbnail = getThumbnails(row.filePath)
    })


    sql = `SELECT a.filePath, max(a.sTime) as maxTime , b.tag, COUNT(b.tag) as count, b.type, b.subtype ` 
    + `FROM (SELECT * FROM tag_table WHERE type = 'tag') AS b LEFT JOIN `
    + `(SELECT * FROM file_table where isCompress = true) AS a `
    + `ON a.filePath = b.filePath GROUP BY tag HAVING a.sTime = maxTime AND count > 1 ORDER BY count DESC`;
    let tag_rows = await sqldb.allSync(sql);
    tag_rows.forEach(row => {
        row.thumbnail = getThumbnails(row.filePath)
    })

    res.send({
        author_rows, 
        tag_rows
    });
});

router.post('/api/allInfo', async (req, res) => {
    const needThumbnail = req.body && req.body.needThumbnail;

    let allThumbnails = {};
    const files = getAllFilePathes().filter(isDisplayableInExplorer);
    if (needThumbnail) {
        allThumbnails = getThumbnails(files);
    }

    const fileToInfo = {};
    files.forEach(e => {
        fileToInfo[e] = db.getFileToInfo(e);
    })

    res.send({
        fileToInfo: fileToInfo,
        allThumbnails: allThumbnails
    });
});

module.exports = router;
