/**
 * Created by alexanderplotkin on 16/12/2017.
 */
const FB_EVENTS_API_URL = 'https://graph.facebook.com/#API_VERSION#/#PAGE_ID#/events?access_token=#ACCESS_TOKEN#&debug=all&format=json&method=get&pretty=0&suppress_http_code=1&fields=cover,name,description,place,start_time';
const FB_VIDEOS_API_URL = 'https://graph.facebook.com/#API_VERSION#/#PAGE_ID#/videos?access_token=#ACCESS_TOKEN#&debug=all&fields=event,content_category,place,permalink_url,id,description,backdated_time_granularity,source,likes,thumbnails,updated_time&format=json&method=get&pretty=0&suppress_http_code=1';
const FB_FEEDS_API_URL = 'https://graph.facebook.com/#API_VERSION#/#PAGE_ID#/feed?access_token=#ACCESS_TOKEN#&debug=all&fields=application,call_to_action,child_attachments,coordinates,created_time,description,link,feed_targeting&include_hidden=true';
const FB_PAGE_ALBUMS_API_URL = 'https://graph.facebook.com/#API_VERSION#/#PAGE_ID#?access_token=#ACCESS_TOKEN#&debug=all&fields=albums%7Bcount%2Clink%2Clocation%2Cname%2Cid%7D&format=json&method=get&pretty=0&suppress_http_code=1';
const FB_ALBUM_PHOTOS_API_URL = 'https://graph.facebook.com/#API_VERSION#/#ALBUM_ID#?access_token=#ACCESS_TOKEN#&debug=all&fields=photos%7Bheight%2Cfrom%2Cid%2Cimages%2Cwidth%2Clink%7D&format=json&method=get&pretty=0&suppress_http_code=1';
const YOUTUBE_VIDEO_LINK_TEMPLATE = 'https://www.youtube.com/embed/';
var _ = require('lodash'),
    moment = require('moment'),
    https = require('https'),
    async = require('async');
module.exports = function (RED) {
    function FBPageDS(config) {
        RED.nodes.createNode(this, config);
        this.on('input', _.bind(function (msg) {
            async.parallel({
                events: _.bind(_getEvents, this),
                videos: _.bind(_getVideos, this),
                audios: _.bind(_getSTAudios, this),
                photos: _.bind(_getPhotos, this)
            }, _.bind(function (error, results) {
                //    finish all
                if (error) {
                    this.error('Something is wrong! ' + error);
                }
                this.status({fill: "blue", shape: "dot", text: "waiting..."});
                this.send(_.extend(msg, {payload: results}));
                return;
            }, this));

            /**
             * _getEvents function retrieves all upcoming events from the Facebook Page
             * @param callback {function}
             */
            function _getEvents(callback) {
                this.status({fill: "yellow", shape: "ring", text: "receives events..."});
                var fbPageEventsURL = FB_EVENTS_API_URL.replace("#ACCESS_TOKEN#", config.fbAPIKey).replace("#PAGE_ID#", config.pageId).replace("#API_VERSION#", config.apiVersion);
                _retrieveData(fbPageEventsURL, null, _.bind(function (eventsResponse) {
                    if (!_.isEmpty(eventsResponse.error)) {
                        callback(eventsResponse.error, null);
                        return;
                    }
                    // sort events in ascending order by start time
                    var events = (!_.isArray(eventsResponse.data)) ? [] : eventsResponse.data;
                    events = events.sort(function (ev1, ev2) {
                        return (new Date(ev1.start_time)) - (new Date(ev2.start_time));
                    });
                    _.each(events, function (event) {
                        event.startTime = moment(event.start_time);
                        event.start_time = event.startTime.format('dddd, MMMM Do YYYY, HH:mm');
                        if (!_.isUndefined(event.end_time)) {
                            event.endTime = moment(event.end_time);
                            event.end_time = event.endTime.format('dddd, MMMM Do YYYY, HH:mm');
                        } else {
                            event.endTime = event.startTime;
                            event.end_time = event.start_time;
                        }
                        if (!!_.isUndefined(event.place)) {

                        }
                    });
                    console.log('***********************************');
                    console.log('getEvents()::events ' + events.length);
                    console.log('***********************************');
                    this.status({fill: "green", shape: "dot", text: "events received"});
                    callback(null, events);

                }, this), function (error) {
                    console.log('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
                    console.log('getEvents()::error ' + error);
                    console.log('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
                    callback(error, null);
                });
            }

            /**
             * _getVideos function retrieves all videos from the Facebook Page
             * @param callback {function}
             */
            function _getVideos(callback) {
                this.status({fill: "yellow", shape: "ring", text: "receives videos..."});
                var fbPageVideosURL = FB_VIDEOS_API_URL.replace("#ACCESS_TOKEN#", config.fbAPIKey).replace("#PAGE_ID#", config.pageId).replace("#API_VERSION#", config.apiVersion);
                _retrieveData(fbPageVideosURL, null, _.bind(function (videosResponse) {
                    if (!_.isEmpty(videosResponse.error)) {
                        callback(videosResponse.error, null);
                        return;
                    }
                    var videos = (!_.isArray(videosResponse.data)) ? [] : videosResponse.data;
                    videos = videos.sort(function (v1, v2) {
                        return (new Date(v2.updated_time)) - (new Date(v1.updated_time));
                    });
                    var videosMapping = {};
                    _.each(videos, function (video) {
                        var youtubeVideoId = videosMapping[video.id];
                        video.fb_source = video.source;
                        if (!_.isUndefined(youtubeVideoId)) {
                            video.source = YOUTUBE_VIDEO_LINK_TEMPLATE + youtubeVideoId;
                            video.videoSourceType = 'yt';
                        } else {
                            video.videoSourceType = 'fb';
                        }
                    });
                    this.log('***********************************');
                    this.log('getVideos()::videos ' + videos.length);
                    this.log('***********************************');
                    this.status({fill: "green", shape: "dot", text: "videos received " + videos.length});
                    callback(null, videos);
                }, this), function (error) {
                    this.error('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
                    this.error('getVideos()::error ' + error);
                    this.error('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
                    callback(error, null);
                });
            }

            /**
             * _getSTAudios function retrieves all SoundCloud audios from the Facebook Page
             * @param callback {function}
             */
            function _getSTAudios(callback) {
                this.status({fill: "yellow", shape: "ring", text: "receives audios..."});
                var feedsURL = FB_FEEDS_API_URL.replace("#ACCESS_TOKEN#", config.fbAPIKey).replace("#PAGE_ID#", config.pageId).replace("#API_VERSION#", config.apiVersion);
                _retrieveData(feedsURL, {}, _.bind(function (feeds) {
                        var audios = [];
                        if (_.isArray(feeds.data)) {
                            _.each(feeds.data, function (feed) {
                                if (!_.isUndefined(feed.application && feed.application.name === 'SoundCloud')) {
                                    audios.push({
                                        trackURL: feed.link.substring(0, feed.link.indexOf('?'))
                                    });
                                }
                            });
                        }
                        this.log('***********************************');
                        this.log('_getSTAudios()::audios ' + audios.length);
                        this.log('***********************************');
                        this.status({fill: "green", shape: "dot", text: "audios received " + audios.length});
                        callback(null, audios);
                    }, this),
                    function (error) {
                        this.error('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
                        this.error('_getSTAudios()::error ' + error);
                        this.error('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
                        callback(error, null);
                    }
                );
            }

            /**
             * _getPhotos function retrieves all photo albums from the Facebook Page
             * @param callback {function}
             */
            function _getPhotos(callback) {
                this.status({fill: "yellow", shape: "ring", text: "receives photos..."});
                var albumsURL = FB_PAGE_ALBUMS_API_URL.replace("#ACCESS_TOKEN#", config.fbAPIKey).replace("#PAGE_ID#", config.pageId).replace("#API_VERSION#", config.apiVersion);
                _retrieveData(albumsURL, {}, _.bind(function (albumsData) {
                        var albums = albumsData.albums.data;
                        var photos = [];
                        var albumsCount = albums.length;
                        var albumsCounter = 0;
                        async.each(albums, function (album, cb) {
                            var albumUrl = FB_ALBUM_PHOTOS_API_URL.replace("#ACCESS_TOKEN#", config.fbAPIKey).
                            replace("#ALBUM_ID#", album.id).replace("#API_VERSION#", config.apiVersion);
                            _retrieveData(albumUrl, {}, _.bind(function(photosData) {
                                if(!_.isEmpty(photosData.photos)) {
                                    var albumPhotos = photosData.photos.data;
                                    photos = _.concat(photos, albumPhotos);
                                }
                                cb();
                            }, this));
                        }, _.bind(function (error, res) {
                            if (error) {
                                this.error('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
                                this.error('_getPhotos()::error ' + error);
                                this.error('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
                                callback(error, null);
                            } else {
                                this.log('***********************************');
                                this.log('_getPhotos()::photos ' + photos.length);
                                this.log('***********************************');
                                this.status({fill: "green", shape: "dot", text: "photos received " + photos.length});
                                callback(null, photos);
                            }

                        }, this));

                    }, this),
                    function (error) {
                        this.error('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
                        this.error('_getPhotos()::error ' + error);
                        this.error('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
                        callback(error, null);
                    }
                );
            }
        }, this));

        function _retrieveData(URL_TEMPLATE, options, success, fail) {
            options = options || {};
            var url = URL_TEMPLATE + (options.params || '');
            var parseBody = options.params ? options.params.parse : true;
            https.get(url, function (res) {
                var body = '';

                res.on('data', function (chunk) {
                    body += chunk;
                });

                res.on('end', function () {
                    if (!!parseBody) {
                        success(JSON.parse(body));
                    } else {
                        success(body);
                    }

                });
            }).on('error', function (e) {
                //this.error("Got an error: ", e);
                fail(e);
            });
        }
    }

    RED.nodes.registerType("fb-page-ds", FBPageDS);
};